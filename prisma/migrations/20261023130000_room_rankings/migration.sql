-- Room-only ranking infrastructure. No historical timestamps are backfilled.
ALTER TABLE "SharedGameEntry" ADD COLUMN "settledAt" TIMESTAMP(3);
CREATE INDEX "SharedGameEntry_roomId_settledAt_idx" ON "SharedGameEntry"("roomId", "settledAt");
CREATE TABLE "RoomRankingRevision" (
  "id" TEXT PRIMARY KEY, "revision" BIGINT NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC')
);
INSERT INTO "RoomRankingRevision"("id") VALUES ('__coverage__'), ('__visibility__');
CREATE TABLE "RoomRankingSnapshot" (
  "id" TEXT PRIMARY KEY, "cacheKey" TEXT NOT NULL UNIQUE, "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RoomRankingSnapshot_expiresAt_idx" ON "RoomRankingSnapshot"("expiresAt");

-- Timestamp the actual server transition, not the scheduled resolveAt time.
CREATE FUNCTION room_ranking_settled_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'SETTLED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'SETTLED') THEN
    NEW."settledAt" := clock_timestamp() AT TIME ZONE 'UTC';
  ELSIF TG_OP = 'UPDATE' THEN
    NEW."settledAt" := OLD."settledAt";
  ELSE
    NEW."settledAt" := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_ranking_settlement BEFORE INSERT OR UPDATE ON "SharedGameEntry"
  FOR EACH ROW EXECUTE FUNCTION room_ranking_settled_at();

-- Cache invalidation commits/rolls back atomically with the source record.
CREATE FUNCTION room_ranking_invalidate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_room TEXT; new_room TEXT;
BEGIN
  IF TG_TABLE_NAME = 'SharedGameEntry' THEN
    IF TG_OP = 'INSERT' AND NEW.status <> 'SETTLED' THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'SETTLED' AND NEW.status <> 'SETTLED' THEN RETURN NULL; END IF;
    IF TG_OP = 'DELETE' AND OLD.status <> 'SETTLED' THEN RETURN NULL; END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN old_room := OLD."roomId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_room := NEW."roomId"; END IF;
  -- Sixteen per-room shards avoid making all unrelated senders contend on a
  -- single cache counter for the entire duration of their gift transactions.
  IF TG_TABLE_NAME = 'GiftTransaction' THEN
    IF old_room IS NOT NULL THEN old_room := old_room || ':' || substr(md5(OLD."senderId"),1,1); END IF;
    IF new_room IS NOT NULL THEN new_room := new_room || ':' || substr(md5(NEW."senderId"),1,1); END IF;
  ELSE
    IF old_room IS NOT NULL THEN old_room := old_room || ':' || substr(md5(OLD."userId"),1,1); END IF;
    IF new_room IS NOT NULL THEN new_room := new_room || ':' || substr(md5(NEW."userId"),1,1); END IF;
  END IF;
  IF old_room IS NOT NULL THEN
    INSERT INTO "RoomRankingRevision"("id") VALUES (old_room)
    ON CONFLICT ("id") DO UPDATE SET revision = "RoomRankingRevision".revision + 1;
  END IF;
  IF new_room IS NOT NULL AND new_room IS DISTINCT FROM old_room THEN
    INSERT INTO "RoomRankingRevision"("id") VALUES (new_room)
    ON CONFLICT ("id") DO UPDATE SET revision = "RoomRankingRevision".revision + 1;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER room_ranking_gift AFTER INSERT OR UPDATE OR DELETE ON "GiftTransaction"
  FOR EACH ROW EXECUTE FUNCTION room_ranking_invalidate();
CREATE TRIGGER room_ranking_game AFTER INSERT OR UPDATE OR DELETE ON "SharedGameEntry"
  FOR EACH ROW EXECUTE FUNCTION room_ranking_invalidate();

CREATE FUNCTION room_ranking_visibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "RoomRankingRevision" SET revision = revision + 1 WHERE id = '__visibility__';
  RETURN NULL;
END $$;
CREATE TRIGGER room_ranking_user_visibility AFTER UPDATE OF status, "deletedAt" OR DELETE ON "User"
  FOR EACH STATEMENT EXECUTE FUNCTION room_ranking_visibility();
CREATE TRIGGER room_ranking_blocks AFTER INSERT OR UPDATE OR DELETE ON "UserBlock"
  FOR EACH STATEMENT EXECUTE FUNCTION room_ranking_visibility();
CREATE TRIGGER room_ranking_bans AFTER INSERT OR UPDATE OR DELETE ON "Ban"
  FOR EACH STATEMENT EXECUTE FUNCTION room_ranking_visibility();
