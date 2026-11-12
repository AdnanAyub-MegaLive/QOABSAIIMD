ALTER TABLE "RoomRocketLaunch"
 ADD COLUMN "grabWindowSeconds" INTEGER NOT NULL DEFAULT 30,
 ADD COLUMN "grabClosesAt" TIMESTAMP(3),
 ADD COLUMN "winnersFinalizedAt" TIMESTAMP(3),
 ADD COLUMN "inRoomWinners" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "inRoomRewards" JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN "fallbackWinners" JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN "grabWinners" JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN "grabbedUserIds" JSONB NOT NULL DEFAULT '[]';
-- Previously launched rewards remain final and are never redrawn or repaid.
UPDATE "RoomRocketLaunch" SET "winnersFinalizedAt" = "createdAt";
CREATE INDEX "RoomRocketLaunch_winnersFinalizedAt_grabClosesAt_idx" ON "RoomRocketLaunch"("winnersFinalizedAt", "grabClosesAt");
