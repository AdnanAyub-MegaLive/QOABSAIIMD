ALTER TABLE "AudioRoom" ADD COLUMN "chatRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AudioRoom" ADD COLUMN "chatClearedAt" TIMESTAMP(3);
ALTER TABLE "AudioRoomMessage" ADD COLUMN "requestId" TEXT;
ALTER TABLE "AudioRoomMessage" ADD COLUMN "chatRevision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "AudioRoomMessage_audioRoomId_chatRevision_createdAt_id_idx" ON "AudioRoomMessage"("audioRoomId", "chatRevision", "createdAt", "id");
CREATE UNIQUE INDEX "AudioRoomMessage_audioRoomId_senderId_requestId_key" ON "AudioRoomMessage"("audioRoomId", "senderId", "requestId");
