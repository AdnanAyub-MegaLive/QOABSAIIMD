CREATE TABLE "AudioRoomVisit" (
  "userId" TEXT NOT NULL,
  "audioRoomId" TEXT NOT NULL,
  "lastVisitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AudioRoomVisit_pkey" PRIMARY KEY ("userId", "audioRoomId"),
  CONSTRAINT "AudioRoomVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AudioRoomVisit_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AudioRoomVisit_userId_lastVisitedAt_audioRoomId_idx" ON "AudioRoomVisit"("userId", "lastVisitedAt", "audioRoomId");
