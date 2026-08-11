CREATE TABLE "AudioRoomMessage" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "audioRoomId" TEXT,
  "roomPublicId" TEXT NOT NULL,
  "roomTitle" TEXT NOT NULL,
  "senderId" TEXT,
  "senderPublicId" TEXT NOT NULL,
  "senderName" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudioRoomMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AudioRoomMessage_publicId_key" ON "AudioRoomMessage"("publicId");
CREATE INDEX "AudioRoomMessage_senderId_createdAt_idx" ON "AudioRoomMessage"("senderId", "createdAt");
CREATE INDEX "AudioRoomMessage_roomPublicId_createdAt_idx" ON "AudioRoomMessage"("roomPublicId", "createdAt");
CREATE INDEX "AudioRoomMessage_createdAt_idx" ON "AudioRoomMessage"("createdAt");

ALTER TABLE "AudioRoomMessage" ADD CONSTRAINT "AudioRoomMessage_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudioRoomMessage" ADD CONSTRAINT "AudioRoomMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
