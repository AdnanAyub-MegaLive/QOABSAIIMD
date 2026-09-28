ALTER TABLE "AudioRoom" ADD COLUMN "seatRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "AudioRoomSeatInvitation" ("id" TEXT NOT NULL,"audioRoomId" TEXT NOT NULL,"inviterId" TEXT NOT NULL,"targetId" TEXT NOT NULL,"seatId" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'PENDING',"expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"respondedAt" TIMESTAMP(3),CONSTRAINT "AudioRoomSeatInvitation_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AudioRoomSeatInvitation_audioRoomId_status_expiresAt_idx" ON "AudioRoomSeatInvitation"("audioRoomId","status","expiresAt");
CREATE INDEX "AudioRoomSeatInvitation_targetId_status_expiresAt_idx" ON "AudioRoomSeatInvitation"("targetId","status","expiresAt");
ALTER TABLE "AudioRoomSeatInvitation" ADD CONSTRAINT "AudioRoomSeatInvitation_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomSeatInvitation" ADD CONSTRAINT "AudioRoomSeatInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomSeatInvitation" ADD CONSTRAINT "AudioRoomSeatInvitation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
