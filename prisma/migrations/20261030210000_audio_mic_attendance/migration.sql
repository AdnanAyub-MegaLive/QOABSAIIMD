CREATE TABLE "AudioRoomMicSession" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "audioRoomId" TEXT NOT NULL REFERENCES "AudioRoom"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "seatRecordId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AudioRoomMicSession_time_order" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE INDEX "AudioRoomMicSession_userId_startedAt_idx" ON "AudioRoomMicSession"("userId", "startedAt");
CREATE INDEX "AudioRoomMicSession_audioRoomId_endedAt_idx" ON "AudioRoomMicSession"("audioRoomId", "endedAt");
CREATE UNIQUE INDEX "AudioRoomMicSession_open_seat" ON "AudioRoomMicSession"("seatRecordId") WHERE "endedAt" IS NULL;

-- Preserve the known start of a currently occupied, joined seat. Completed historical
-- occupancy has already been overwritten and must never be inferred from room lifetime.
INSERT INTO "AudioRoomMicSession" ("audioRoomId", "userId", "seatRecordId", "startedAt", "lastSeenAt")
SELECT s."audioRoomId", s."occupantUserId", s.id, LEAST(s."occupiedAt", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
FROM "AudioRoomSeat" s JOIN "AudioRoomMember" m ON m."audioRoomId"=s."audioRoomId" AND m."userId"=s."occupantUserId"
JOIN "AudioRoom" r ON r.id=s."audioRoomId"
WHERE s."occupantUserId" IS NOT NULL AND s."occupiedAt" IS NOT NULL AND m."socketCount">0 AND r.status='LIVE';

-- Record all admission/removal paths, including invitations, kicks, seat deletion,
-- layout changes and bulk clears, in the same transaction as the seat mutation.
CREATE FUNCTION record_audio_mic_session() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at_time TIMESTAMP(3) := clock_timestamp();
BEGIN
  IF TG_OP='UPDATE' AND OLD."occupantUserId" IS NOT DISTINCT FROM NEW."occupantUserId" THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE "AudioRoomMicSession" SET "endedAt"=GREATEST("startedAt", LEAST(at_time,"lastSeenAt"+interval '45 seconds'))
    WHERE "seatRecordId"=OLD.id AND "endedAt" IS NULL;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."occupantUserId" IS NOT NULL THEN
    INSERT INTO "AudioRoomMicSession" ("audioRoomId","userId","seatRecordId","startedAt","lastSeenAt")
    VALUES (NEW."audioRoomId",NEW."occupantUserId",NEW.id,LEAST(COALESCE(NEW."occupiedAt",at_time),at_time),at_time);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audio_mic_session_occupancy AFTER INSERT OR DELETE OR UPDATE OF "occupantUserId" ON "AudioRoomSeat"
FOR EACH ROW EXECUTE FUNCTION record_audio_mic_session();

-- Called every 15 seconds from authoritative Socket.IO membership. Lock seat rows
-- so a concurrent leave cannot race the heartbeat into reopening a finished session.
CREATE FUNCTION refresh_audio_mic_attendance(room_id TEXT, connected_ids TEXT[], at_time TIMESTAMP(3))
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM "AudioRoomSeat" WHERE "audioRoomId"=room_id ORDER BY id FOR UPDATE;
  UPDATE "AudioRoomMicSession" a SET "endedAt"=GREATEST(a."startedAt",LEAST(at_time,a."lastSeenAt"+interval '45 seconds'))
  WHERE a."audioRoomId"=room_id AND a."endedAt" IS NULL AND (
    NOT (a."userId"=ANY(connected_ids)) OR a."lastSeenAt" < at_time-interval '45 seconds' OR
    NOT EXISTS (SELECT 1 FROM "AudioRoomSeat" s WHERE s.id=a."seatRecordId" AND s."occupantUserId"=a."userId")
  );
  UPDATE "AudioRoomMicSession" SET "lastSeenAt"=at_time WHERE "audioRoomId"=room_id AND "endedAt" IS NULL;
  INSERT INTO "AudioRoomMicSession" ("audioRoomId","userId","seatRecordId","startedAt","lastSeenAt")
  SELECT room_id,s."occupantUserId",s.id,at_time,at_time FROM "AudioRoomSeat" s
  WHERE s."audioRoomId"=room_id AND s."occupantUserId"=ANY(connected_ids)
  ON CONFLICT ("seatRecordId") WHERE "endedAt" IS NULL DO NOTHING;
END $$;
