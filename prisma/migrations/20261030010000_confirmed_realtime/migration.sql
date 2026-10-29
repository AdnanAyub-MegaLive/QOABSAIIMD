BEGIN;
-- No wallet/history backfill or reward execution. Revision zero is the baseline.
ALTER TABLE "User" ADD COLUMN "walletRevision" BIGINT NOT NULL DEFAULT 0;
CREATE TABLE "ConfirmedRealtimeEvent" (
 id TEXT PRIMARY KEY, event TEXT NOT NULL, "userId" TEXT, "roomId" TEXT,
 payload JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "deliveredAt" TIMESTAMP(3), attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "ConfirmedRealtimeEvent_deliveredAt_createdAt_idx" ON "ConfirmedRealtimeEvent"("deliveredAt","createdAt");
CREATE FUNCTION portal_wallet_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."coinBalance",NEW."hostSalaryCoinBalance",NEW."resellerCoinBalance",NEW."couponBalance") IS DISTINCT FROM
    ROW(OLD."coinBalance",OLD."hostSalaryCoinBalance",OLD."resellerCoinBalance",OLD."couponBalance") THEN
   NEW."walletRevision" := OLD."walletRevision" + 1;
 ELSE NEW."walletRevision" := OLD."walletRevision";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_wallet_revision BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION portal_wallet_revision();
CREATE FUNCTION portal_wallet_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid TEXT := 'wallet:' || txid_current()::text || ':' || NEW.id;
BEGIN
 IF NEW."walletRevision" = OLD."walletRevision" THEN RETURN NEW; END IF;
 INSERT INTO "ConfirmedRealtimeEvent"(id,event,"userId",payload)
 VALUES(eid,'wallet:updated',NEW.id,jsonb_build_object(
   'userId',NEW."publicId",'walletRevision',NEW."walletRevision"::text,
   'reason','BALANCE_CHANGED','transactionId',NULL,'serverTime',clock_timestamp(),
   'balances',jsonb_build_object('coins',NEW."coinBalance"::text,'diamonds',NEW."hostSalaryCoinBalance"::text,
     'businessCoins',NEW."resellerCoinBalance"::text,'coupons',NEW."couponBalance"::text)))
 ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload;
 PERFORM pg_notify('portal_confirmed_realtime','wallet');
 RETURN NEW;
END $$;
CREATE TRIGGER portal_wallet_event AFTER UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION portal_wallet_event();

-- These are derived all-time gift-value totals, matching room gift history;
-- they are not wallet balances or Daily/Weekly/Monthly ranking scores.
LOCK TABLE "GiftTransaction" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE "RoomGiftTotal" ("roomId" TEXT PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0, coins BIGINT NOT NULL DEFAULT 0);
CREATE TABLE "RoomRecipientGiftTotal" ("roomId" TEXT NOT NULL,"userId" TEXT NOT NULL,coins BIGINT NOT NULL DEFAULT 0,PRIMARY KEY("roomId","userId"));
CREATE TABLE "RoomGiftDelta" (id TEXT PRIMARY KEY,"roomId" TEXT NOT NULL,coins BIGINT NOT NULL DEFAULT 0,recipients JSONB NOT NULL DEFAULT '{}',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"processedAt" TIMESTAMP(3));
CREATE INDEX "RoomGiftDelta_processedAt_roomId_idx" ON "RoomGiftDelta"("processedAt","roomId");
INSERT INTO "RoomGiftTotal"("roomId",coins)
 SELECT "roomId",SUM("coinValue") FROM "GiftTransaction" WHERE "roomId" IS NOT NULL AND "reversedAt" IS NULL GROUP BY "roomId";
INSERT INTO "RoomRecipientGiftTotal"("roomId","userId",coins)
 SELECT "roomId","recipientUserId",SUM("coinValue") FROM "GiftTransaction"
 WHERE "roomId" IS NOT NULL AND "recipientUserId" IS NOT NULL AND "reversedAt" IS NULL GROUP BY "roomId","recipientUserId";
CREATE FUNCTION portal_room_gift_delta(rid TEXT, uid TEXT, delta BIGINT) RETURNS void LANGUAGE plpgsql AS $$
DECLARE eid TEXT; changed JSONB := '{}'::jsonb;
BEGIN
 IF rid IS NULL OR delta=0 THEN RETURN; END IF;
 IF uid IS NOT NULL THEN changed:=jsonb_build_object(uid,delta::text); END IF;
 eid:='room:' || txid_current()::text || ':' || rid;
 -- Only this transaction's delta is locked; no shared room row in gift settlement.
 INSERT INTO "RoomGiftDelta"(id,"roomId",coins,recipients) VALUES(eid,rid,delta,changed)
 ON CONFLICT(id) DO UPDATE SET coins="RoomGiftDelta".coins+delta,
 recipients=CASE WHEN uid IS NULL THEN "RoomGiftDelta".recipients ELSE "RoomGiftDelta".recipients ||
   jsonb_build_object(uid,(COALESCE(("RoomGiftDelta".recipients->>uid)::bigint,0)+delta)::text) END;
 PERFORM pg_notify('portal_confirmed_realtime','room');
END $$;
-- Runs only in the independent presentation worker, never in gift settlement.
-- One short fold per room, bounded source batch, no media or network operations.
CREATE FUNCTION portal_fold_room_gift_deltas(only_room TEXT DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE rid TEXT; ids TEXT[]; amount BIGINT; item RECORD; total "RoomGiftTotal"; received BIGINT;
 changed JSONB; folded INTEGER := 0;
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
   changed:='{}'::jsonb;
   FOR item IN SELECT entry.key AS uid,sum(entry.value::bigint) AS coins FROM "RoomGiftDelta" d,
     LATERAL jsonb_each_text(d.recipients) entry WHERE d.id=ANY(ids) GROUP BY entry.key LOOP
     INSERT INTO "RoomRecipientGiftTotal"("roomId","userId",coins) VALUES(rid,item.uid,item.coins)
       ON CONFLICT("roomId","userId") DO UPDATE SET coins="RoomRecipientGiftTotal".coins+item.coins RETURNING coins INTO received;
     changed:=changed||jsonb_build_object(item.uid,received::text);
   END LOOP;
   INSERT INTO "ConfirmedRealtimeEvent"(id,event,"roomId",payload) VALUES(
     'room-total:'||rid||':'||total.revision::text,'audio-room:gift-totals',rid,
     jsonb_build_object('roomId',rid,'roomTotalsRevision',total.revision::text,'roomTotalCoins',total.coins::text,'changedRecipients',changed,'serverTime',clock_timestamp()));
   UPDATE "RoomGiftDelta" SET "processedAt"=clock_timestamp() WHERE id=ANY(ids);
   folded:=folded+cardinality(ids);
 END LOOP;
 RETURN folded;
END $$;
CREATE FUNCTION portal_room_gift_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
   IF ROW(NEW."roomId",NEW."recipientUserId",NEW."coinValue",NEW."reversedAt") IS NOT DISTINCT FROM
      ROW(OLD."roomId",OLD."recipientUserId",OLD."coinValue",OLD."reversedAt") THEN RETURN NULL; END IF;
 END IF;
 IF TG_OP<>'INSERT' AND OLD."reversedAt" IS NULL THEN
   PERFORM portal_room_gift_delta(OLD."roomId",OLD."recipientUserId",-OLD."coinValue");
 END IF;
 IF TG_OP<>'DELETE' AND NEW."reversedAt" IS NULL THEN
   PERFORM portal_room_gift_delta(NEW."roomId",NEW."recipientUserId",NEW."coinValue");
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER portal_room_gift_event AFTER INSERT OR DELETE OR UPDATE OF "coinValue","roomId","recipientUserId","reversedAt" ON "GiftTransaction"
 FOR EACH ROW EXECUTE FUNCTION portal_room_gift_event();

-- NOTIFY is delivered by PostgreSQL only after commit. Payloads contain no data.
CREATE FUNCTION portal_presentation_wakeup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_notify('portal_confirmed_realtime',TG_ARGV[0]); RETURN NULL; END $$;
CREATE TRIGGER portal_confirmed_event_wakeup AFTER INSERT ON "ConfirmedRealtimeEvent" FOR EACH STATEMENT EXECUTE FUNCTION portal_presentation_wakeup('wallet');
CREATE TRIGGER portal_announcement_gift AFTER INSERT ON "GiftRecoverySnapshot" FOR EACH STATEMENT EXECUTE FUNCTION portal_presentation_wakeup('announcements');
CREATE TRIGGER portal_announcement_game AFTER UPDATE OF status,"settledAt" ON "SharedGameEntry" FOR EACH STATEMENT EXECUTE FUNCTION portal_presentation_wakeup('announcements');
CREATE TRIGGER portal_notification_wakeup AFTER INSERT ON "Notification" FOR EACH STATEMENT EXECUTE FUNCTION portal_presentation_wakeup('notifications');
COMMIT;
