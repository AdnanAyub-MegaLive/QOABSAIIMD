BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
-- Fail rather than wait behind live traffic. All source writers are paused only
-- for the atomic history snapshot/trigger installation; no balances are changed.
LOCK TABLE "GiftTransaction", "GiftSettlement", "WalletTransaction" IN SHARE ROW EXCLUSIVE MODE;
-- An old settled gift without an original Diamond credit must be reconciled,
-- never silently converted from Coins using today's rules.
DO $$ BEGIN
 IF EXISTS (
   SELECT 1 FROM "GiftTransaction" g LEFT JOIN "GiftSettlement" s ON s."giftTransactionId"=g.id
   LEFT JOIN "WalletTransaction" w ON w."referenceId"=g.id AND w."userId"=g."recipientUserId"
     AND w.type='GIFT_RECEIVED' AND w.direction='CREDIT' AND w.status='COMPLETED'
   WHERE g."roomId" IS NOT NULL AND g."recipientUserId" IS NOT NULL AND g."reversedAt" IS NULL
     AND g."coinValue">0 AND s."recipientDiamonds" IS NULL AND w.diamonds IS NULL
 ) THEN RAISE EXCEPTION 'ROOM_DIAMOND_HISTORY_REQUIRES_RECONCILIATION: original settled credits are missing'; END IF;
END $$;
ALTER TABLE "RoomGiftDelta" ADD COLUMN "diamondRecipients" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "RoomRecipientGiftTotal" ADD COLUMN diamonds BIGINT NOT NULL DEFAULT 0;
CREATE TABLE "RoomGiftDiamondCredit" (
 "giftId" TEXT PRIMARY KEY,"roomId" TEXT NOT NULL,"userId" TEXT NOT NULL,diamonds BIGINT NOT NULL
);
CREATE INDEX "RoomGiftDiamondCredit_userId_idx" ON "RoomGiftDiamondCredit"("userId");
-- Historical values come from recorded credit, never today's gift price/rate.
INSERT INTO "RoomGiftDiamondCredit"("giftId","roomId","userId",diamonds)
SELECT g.id,g."roomId",g."recipientUserId",COALESCE(w.diamonds,s."recipientDiamonds",0)
FROM "GiftTransaction" g
LEFT JOIN "GiftSettlement" s ON s."giftTransactionId"=g.id
LEFT JOIN "WalletTransaction" w ON w."referenceId"=g.id AND w."userId"=g."recipientUserId"
 AND w.type='GIFT_RECEIVED' AND w.direction='CREDIT' AND w.status='COMPLETED'
WHERE g."roomId" IS NOT NULL AND g."recipientUserId" IS NOT NULL AND g."reversedAt" IS NULL;
INSERT INTO "RoomRecipientGiftTotal"("roomId","userId",diamonds)
SELECT "roomId","userId",SUM(diamonds) FROM "RoomGiftDiamondCredit" GROUP BY "roomId","userId"
ON CONFLICT("roomId","userId") DO UPDATE SET diamonds=EXCLUDED.diamonds;
-- Cached clients must accept the newly backfilled field even without a new gift.
UPDATE "RoomGiftTotal" t SET revision=revision+1
WHERE EXISTS (SELECT 1 FROM "RoomGiftDiamondCredit" d WHERE d."roomId"=t."roomId");

CREATE FUNCTION portal_room_diamond_delta(rid TEXT,uid TEXT,delta BIGINT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE eid TEXT;
BEGIN
 IF rid IS NULL OR uid IS NULL OR delta=0 THEN RETURN; END IF;
 eid:='room:'||txid_current()::text||':'||rid;
 INSERT INTO "RoomGiftDelta"(id,"roomId","diamondRecipients") VALUES(eid,rid,jsonb_build_object(uid,delta::text))
 ON CONFLICT(id) DO UPDATE SET "diamondRecipients"="RoomGiftDelta"."diamondRecipients"||
 jsonb_build_object(uid,(COALESCE(("RoomGiftDelta"."diamondRecipients"->>uid)::bigint,0)+delta)::text);
 PERFORM pg_notify('portal_confirmed_realtime','room');
END $$;
CREATE FUNCTION portal_sync_room_diamond_credit(gid TEXT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE previous "RoomGiftDiamondCredit"; current_credit RECORD;
BEGIN
 -- Per-gift serialization only. Different senders/recipients/rooms do not wait.
 PERFORM pg_advisory_xact_lock(hashtextextended('room-diamond-gift:'||gid,0));
 SELECT * INTO previous FROM "RoomGiftDiamondCredit" WHERE "giftId"=gid;
 SELECT g."roomId" AS rid,g."recipientUserId" AS uid,COALESCE(w.diamonds,s."recipientDiamonds",0)::bigint AS diamonds
 INTO current_credit FROM "GiftTransaction" g
 LEFT JOIN "GiftSettlement" s ON s."giftTransactionId"=g.id
 LEFT JOIN "WalletTransaction" w ON w."referenceId"=g.id AND w."userId"=g."recipientUserId"
  AND w.type='GIFT_RECEIVED' AND w.direction='CREDIT' AND w.status='COMPLETED'
 WHERE g.id=gid AND g."roomId" IS NOT NULL AND g."recipientUserId" IS NOT NULL AND g."reversedAt" IS NULL;
 IF previous."giftId" IS NOT NULL AND ROW(previous."roomId",previous."userId",previous.diamonds)
   IS NOT DISTINCT FROM ROW(current_credit.rid,current_credit.uid,current_credit.diamonds) THEN RETURN; END IF;
 IF previous."giftId" IS NOT NULL THEN
   PERFORM portal_room_diamond_delta(previous."roomId",previous."userId",-previous.diamonds);
   DELETE FROM "RoomGiftDiamondCredit" WHERE "giftId"=gid;
 END IF;
 IF current_credit.rid IS NOT NULL THEN
   INSERT INTO "RoomGiftDiamondCredit" VALUES(gid,current_credit.rid,current_credit.uid,current_credit.diamonds);
   PERFORM portal_room_diamond_delta(current_credit.rid,current_credit.uid,current_credit.diamonds);
 END IF;
END $$;
CREATE FUNCTION portal_room_diamond_source_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_id TEXT; new_id TEXT;
BEGIN
 IF TG_TABLE_NAME='GiftTransaction' THEN
   IF TG_OP<>'INSERT' THEN old_id:=OLD.id; END IF;
   IF TG_OP<>'DELETE' THEN new_id:=NEW.id; END IF;
 ELSIF TG_TABLE_NAME='GiftSettlement' THEN
   IF TG_OP<>'INSERT' THEN old_id:=OLD."giftTransactionId"; END IF;
   IF TG_OP<>'DELETE' THEN new_id:=NEW."giftTransactionId"; END IF;
 ELSE
   IF TG_OP<>'INSERT' AND OLD.type='GIFT_RECEIVED' THEN old_id:=OLD."referenceId"; END IF;
   IF TG_OP<>'DELETE' AND NEW.type='GIFT_RECEIVED' THEN new_id:=NEW."referenceId"; END IF;
 END IF;
 IF old_id IS NOT NULL THEN PERFORM portal_sync_room_diamond_credit(old_id); END IF;
 IF new_id IS NOT NULL AND new_id IS DISTINCT FROM old_id THEN PERFORM portal_sync_room_diamond_credit(new_id); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER portal_room_diamond_gift AFTER INSERT OR DELETE OR UPDATE OF "roomId","recipientUserId","reversedAt" ON "GiftTransaction"
 FOR EACH ROW EXECUTE FUNCTION portal_room_diamond_source_event();
CREATE TRIGGER portal_room_diamond_settlement AFTER INSERT OR DELETE OR UPDATE OF "recipientDiamonds","giftTransactionId" ON "GiftSettlement"
 FOR EACH ROW EXECUTE FUNCTION portal_room_diamond_source_event();
CREATE TRIGGER portal_room_diamond_wallet AFTER INSERT OR DELETE OR UPDATE OF diamonds,status,"referenceId","userId",type,direction ON "WalletTransaction"
 FOR EACH ROW EXECUTE FUNCTION portal_room_diamond_source_event();
CREATE OR REPLACE FUNCTION portal_fold_room_gift_deltas(only_room TEXT DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE rid TEXT; ids TEXT[]; amount BIGINT; item RECORD; total "RoomGiftTotal"; received BIGINT; received_diamonds BIGINT;
 changed JSONB; changed_diamonds JSONB; folded INTEGER := 0;
BEGIN
 FOR rid IN SELECT "roomId" FROM "RoomGiftDelta" WHERE "processedAt" IS NULL
   AND (only_room IS NULL OR "roomId"=only_room) GROUP BY "roomId" ORDER BY min("createdAt") LIMIT 20 LOOP
   IF NOT pg_try_advisory_xact_lock(hashtextextended('portal-room-total:'||rid,0)) THEN CONTINUE; END IF;
   SELECT array_agg(id),sum(coins) INTO ids,amount FROM (
     SELECT id,coins FROM "RoomGiftDelta" WHERE "roomId"=rid AND "processedAt" IS NULL ORDER BY "createdAt",id LIMIT 100 FOR UPDATE
   ) batch;
   IF ids IS NULL THEN CONTINUE; END IF;
   INSERT INTO "RoomGiftTotal"("roomId",revision,coins) VALUES(rid,1,amount)
     ON CONFLICT("roomId") DO UPDATE SET coins="RoomGiftTotal".coins+amount,revision="RoomGiftTotal".revision+1 RETURNING * INTO total;
   changed:='{}'::jsonb; changed_diamonds:='{}'::jsonb;
   FOR item IN SELECT uid,SUM(coins)::bigint AS coins,SUM(diamonds)::bigint AS diamonds FROM (
     SELECT entry.key AS uid,entry.value::bigint AS coins,0::bigint AS diamonds FROM "RoomGiftDelta" d,
       LATERAL jsonb_each_text(d.recipients) entry WHERE d.id=ANY(ids)
     UNION ALL
     SELECT entry.key,0::bigint,entry.value::bigint FROM "RoomGiftDelta" d,
       LATERAL jsonb_each_text(d."diamondRecipients") entry WHERE d.id=ANY(ids)
   ) contributions GROUP BY uid LOOP
     INSERT INTO "RoomRecipientGiftTotal"("roomId","userId",coins,diamonds) VALUES(rid,item.uid,item.coins,item.diamonds)
       ON CONFLICT("roomId","userId") DO UPDATE SET coins="RoomRecipientGiftTotal".coins+item.coins,
         diamonds="RoomRecipientGiftTotal".diamonds+item.diamonds RETURNING coins,diamonds INTO received,received_diamonds;
     changed:=changed||jsonb_build_object(item.uid,received::text);
     changed_diamonds:=changed_diamonds||jsonb_build_object(item.uid,received_diamonds::text);
   END LOOP;
   INSERT INTO "ConfirmedRealtimeEvent"(id,event,"roomId",payload) VALUES(
     'room-total:'||rid||':'||total.revision::text,'audio-room:gift-totals',rid,
     jsonb_build_object('roomId',rid,'roomTotalsRevision',total.revision::text,'roomTotalCoins',total.coins::text,'changedRecipients',changed,'changedRecipientDiamonds',changed_diamonds,'serverTime',clock_timestamp()));
   UPDATE "RoomGiftDelta" SET "processedAt"=clock_timestamp() WHERE id=ANY(ids);
   folded:=folded+cardinality(ids);
 END LOOP;
 RETURN folded;
END $$;

COMMIT;
