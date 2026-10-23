-- No source history, balances or rewards are updated/backfilled.
CREATE INDEX "GiftTransaction_createdAt_idx" ON "GiftTransaction"("createdAt");
CREATE TABLE "HourlyGiftRankingCache" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL, "sourceRevision" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "HourlyGiftRankingCache_expiresAt_idx" ON "HourlyGiftRankingCache"("expiresAt");
INSERT INTO "RoomRankingRevision"(id) VALUES ('__hourly_gifts__');

-- Separate global shards: leave existing room invalidation and scoring alone.
CREATE FUNCTION hourly_gift_ranking_bump(sender TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF sender IS NOT NULL THEN
    INSERT INTO "RoomRankingRevision"(id) VALUES ('__hourly_gifts__:' || substr(md5(sender),1,1))
    ON CONFLICT (id) DO UPDATE SET revision = "RoomRankingRevision".revision + 1;
  END IF;
END $$;
CREATE FUNCTION hourly_gift_ranking_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sender TEXT; old_id TEXT; new_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'GiftTransaction' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM hourly_gift_ranking_bump(OLD."senderId"); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM hourly_gift_ranking_bump(NEW."senderId"); END IF;
    RETURN NULL;
  ELSIF TG_TABLE_NAME = 'GiftSettlement' THEN
    IF TG_OP <> 'INSERT' THEN old_id := OLD."giftTransactionId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_id := NEW."giftTransactionId"; END IF;
  ELSIF TG_TABLE_NAME = 'GiftRecoverySnapshot' THEN
    IF TG_OP <> 'INSERT' THEN old_id := OLD."giftId"; END IF;
    IF TG_OP <> 'DELETE' THEN new_id := NEW."giftId"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' AND OLD.action = 'BACKPACK_GIFT_SENT' AND OLD."entityType" = 'GiftTransaction' THEN old_id := OLD."entityId"; END IF;
    IF TG_OP <> 'DELETE' AND NEW.action = 'BACKPACK_GIFT_SENT' AND NEW."entityType" = 'GiftTransaction' THEN new_id := NEW."entityId"; END IF;
  END IF;
  FOR sender IN SELECT DISTINCT "senderId" FROM "GiftTransaction" WHERE id IN (old_id, new_id) LOOP
    PERFORM hourly_gift_ranking_bump(sender);
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER hourly_gift_ranking_gifts AFTER INSERT OR UPDATE OR DELETE ON "GiftTransaction"
  FOR EACH ROW EXECUTE FUNCTION hourly_gift_ranking_invalidate();
CREATE TRIGGER hourly_gift_ranking_settlements AFTER INSERT OR UPDATE OR DELETE ON "GiftSettlement"
  FOR EACH ROW EXECUTE FUNCTION hourly_gift_ranking_invalidate();
CREATE TRIGGER hourly_gift_ranking_recovery AFTER INSERT OR UPDATE OR DELETE ON "GiftRecoverySnapshot"
  FOR EACH ROW EXECUTE FUNCTION hourly_gift_ranking_invalidate();
CREATE TRIGGER hourly_gift_ranking_inventory AFTER INSERT OR UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION hourly_gift_ranking_invalidate();
