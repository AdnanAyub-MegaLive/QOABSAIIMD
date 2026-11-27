ALTER TABLE "VideoLiveSession" ADD COLUMN "chatLocked" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "seatsLocked" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "VideoLiveAdmin" ("sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "VideoLiveAdmin_pkey" PRIMARY KEY ("sessionId", "userId"));
CREATE INDEX "VideoLiveAdmin_userId_idx" ON "VideoLiveAdmin"("userId");
ALTER TABLE "VideoLiveAdmin" ADD CONSTRAINT "VideoLiveAdmin_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VideoLiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoLiveAdmin" ADD CONSTRAINT "VideoLiveAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
