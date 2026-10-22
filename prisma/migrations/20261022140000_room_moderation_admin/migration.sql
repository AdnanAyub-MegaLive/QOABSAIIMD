ALTER TABLE "AudioRoomModerationLog" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "AudioRoomModerationLog" ADD COLUMN "adminActorId" TEXT, ADD COLUMN "adminActorName" TEXT;
CREATE INDEX "AudioRoomModerationLog_createdAt_id_idx" ON "AudioRoomModerationLog"("createdAt", "id");
