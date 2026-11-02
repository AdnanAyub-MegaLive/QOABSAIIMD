-- Additive only. No historical gifts are backfilled and Rocket starts disabled.
CREATE TABLE "RoomRocketSettings" ("id" TEXT PRIMARY KEY DEFAULT 'GLOBAL', "enabled" BOOLEAN NOT NULL DEFAULT false, "config" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "RoomRocketSeason" ("id" TEXT PRIMARY KEY, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL, "config" JSONB NOT NULL);
CREATE INDEX "RoomRocketSeason_endsAt_idx" ON "RoomRocketSeason"("endsAt");
CREATE TABLE "RoomRocketProgress" ("roomId" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL, "level" INTEGER NOT NULL DEFAULT 1, "coins" BIGINT NOT NULL DEFAULT 0 CHECK ("coins" >= 0), "revision" INTEGER NOT NULL DEFAULT 0, "dirty" BOOLEAN NOT NULL DEFAULT true, "emittedAt" TIMESTAMP(3));
CREATE INDEX "RoomRocketProgress_dirty_emittedAt_idx" ON "RoomRocketProgress"("dirty", "emittedAt");
CREATE TABLE "RoomRocketContribution" ("campaignId" TEXT NOT NULL, "roomId" TEXT NOT NULL, "level" INTEGER NOT NULL, "userId" TEXT NOT NULL, "coins" BIGINT NOT NULL DEFAULT 0 CHECK ("coins" >= 0), PRIMARY KEY ("campaignId", "roomId", "level", "userId"));
CREATE INDEX "RoomRocketContribution_campaignId_roomId_level_coins_idx" ON "RoomRocketContribution"("campaignId", "roomId", "level", "coins");
CREATE TABLE "RoomRocketGift" ("giftId" TEXT PRIMARY KEY, "roomId" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "senderId" TEXT NOT NULL, "allocations" JSONB NOT NULL, "reversedAt" TIMESTAMP(3));
CREATE TABLE "RoomRocketLaunch" ("id" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL, "roomId" TEXT NOT NULL, "level" INTEGER NOT NULL, "paidUserIds" JSONB NOT NULL DEFAULT '[]', "winners" JSONB NOT NULL, "topContributor" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "paidAt" TIMESTAMP(3));
CREATE UNIQUE INDEX "RoomRocketLaunch_campaignId_roomId_level_key" ON "RoomRocketLaunch"("campaignId", "roomId", "level");
CREATE INDEX "RoomRocketLaunch_paidAt_createdAt_idx" ON "RoomRocketLaunch"("paidAt", "createdAt");
