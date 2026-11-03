CREATE TABLE "AudioRoomPkSearch" (
 "id" TEXT PRIMARY KEY, "roomId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'WAITING', "pkId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AudioRoomPkSearch_ownerId_requestKey_key" ON "AudioRoomPkSearch"("ownerId","requestKey");
CREATE INDEX "AudioRoomPkSearch_status_createdAt_idx" ON "AudioRoomPkSearch"(status,"createdAt");
CREATE INDEX "AudioRoomPkSearch_roomId_status_idx" ON "AudioRoomPkSearch"("roomId",status);
