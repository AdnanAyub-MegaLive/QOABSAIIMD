CREATE TABLE "AudioRoomSeatRequest" (
 "id" TEXT PRIMARY KEY, "audioRoomId" TEXT NOT NULL, "requesterId" TEXT NOT NULL,
 "seatId" TEXT, "note" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 "respondedAt" TIMESTAMP(3), "actorPublicId" TEXT, "reason" TEXT, "notifiedAt" TIMESTAMP(3),
 CONSTRAINT "AudioRoomSeatRequest_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "AudioRoomSeatRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AudioRoomSeatRequest_audioRoomId_status_createdAt_id_idx" ON "AudioRoomSeatRequest"("audioRoomId","status","createdAt","id");
CREATE INDEX "AudioRoomSeatRequest_status_expiresAt_idx" ON "AudioRoomSeatRequest"("status","expiresAt");
CREATE INDEX "AudioRoomSeatRequest_requesterId_status_idx" ON "AudioRoomSeatRequest"("requesterId","status");
CREATE INDEX "AudioRoomSeatRequest_notifiedAt_respondedAt_idx" ON "AudioRoomSeatRequest"("notifiedAt","respondedAt");
CREATE UNIQUE INDEX "AudioRoomSeatRequest_one_pending" ON "AudioRoomSeatRequest"("audioRoomId","requesterId") WHERE "status"='PENDING';
