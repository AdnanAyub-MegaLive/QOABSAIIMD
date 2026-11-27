BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- Invalidate disposable room snapshots atomically with provider debits/reversals.
-- No balances, transaction history, or already-issued rewards are changed.
CREATE FUNCTION room_ranking_tulasi_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_key TEXT; new_key TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.type = 'GAME_WAGER' AND OLD.metadata->>'provider' = 'TULASI' THEN
      old_key := NULLIF(OLD.metadata->>'roomId','') || ':' || substr(md5(OLD."userId"),1,1);
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.type = 'GAME_WAGER' AND NEW.metadata->>'provider' = 'TULASI' THEN
      new_key := NULLIF(NEW.metadata->>'roomId','') || ':' || substr(md5(NEW."userId"),1,1);
    END IF;
  END IF;
  IF old_key IS NOT NULL THEN
    INSERT INTO "RoomRankingRevision"(id) VALUES (old_key)
    ON CONFLICT (id) DO UPDATE SET revision = "RoomRankingRevision".revision + 1;
  END IF;
  IF new_key IS NOT NULL AND new_key IS DISTINCT FROM old_key THEN
    INSERT INTO "RoomRankingRevision"(id) VALUES (new_key)
    ON CONFLICT (id) DO UPDATE SET revision = "RoomRankingRevision".revision + 1;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER room_ranking_tulasi AFTER INSERT OR UPDATE OR DELETE ON "WalletTransaction"
  FOR EACH ROW EXECUTE FUNCTION room_ranking_tulasi_invalidate();
UPDATE "RoomRankingRevision" SET revision = revision + 1 WHERE id = '__visibility__';
COMMIT;
