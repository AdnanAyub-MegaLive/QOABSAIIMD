CREATE TABLE "AudioRoomEntertainmentState" (
  "audioRoomId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "music" JSONB,
  "game" JSONB,
  "campaign" JSONB,
  "watch" JSONB,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AudioRoomEntertainmentState_pkey" PRIMARY KEY ("audioRoomId")
);
CREATE INDEX "AudioRoomEntertainmentState_updatedAt_idx" ON "AudioRoomEntertainmentState"("updatedAt");
ALTER TABLE "AudioRoomEntertainmentState" ADD CONSTRAINT "AudioRoomEntertainmentState_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
