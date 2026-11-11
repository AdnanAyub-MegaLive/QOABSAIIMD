ALTER TABLE "RoomRocketProgress" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "cycleStartedAt" TIMESTAMP(3), ADD COLUMN "cooldownUntil" TIMESTAMP(3), ADD COLUMN "resetAt" TIMESTAMP(3);
ALTER TABLE "RoomRocketContribution" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RoomRocketContribution" DROP CONSTRAINT "RoomRocketContribution_pkey";
ALTER TABLE "RoomRocketContribution" ADD PRIMARY KEY ("campaignId","roomId","cycle","level","userId");
DROP INDEX "RoomRocketContribution_campaignId_roomId_level_coins_idx";
CREATE INDEX "RoomRocketContribution_campaignId_roomId_cycle_level_coins_idx" ON "RoomRocketContribution"("campaignId","roomId","cycle","level","coins");
ALTER TABLE "RoomRocketLaunch" ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "resetAt" TIMESTAMP(3);
DROP INDEX "RoomRocketLaunch_campaignId_roomId_level_key";
CREATE UNIQUE INDEX "RoomRocketLaunch_campaignId_roomId_cycle_level_key" ON "RoomRocketLaunch"("campaignId","roomId","cycle","level");
CREATE TABLE "RoomRocketCredit" ("giftId" TEXT NOT NULL PRIMARY KEY, "seq" BIGSERIAL NOT NULL UNIQUE, "roomId" TEXT NOT NULL,"campaignId" TEXT NOT NULL,"senderId" TEXT NOT NULL,"coins" BIGINT NOT NULL);
CREATE INDEX "RoomRocketCredit_campaignId_roomId_seq_idx" ON "RoomRocketCredit"("campaignId","roomId","seq");
-- Existing completed rockets enter the new reset lifecycle without replaying rewards.
UPDATE "RoomRocketLaunch" SET "resetAt"="createdAt"+INTERVAL '3 hours' WHERE level=3;
UPDATE "RoomRocketProgress" p SET "resetAt"=l."resetAt",dirty=true FROM "RoomRocketLaunch" l WHERE l."campaignId"=p."campaignId" AND l."roomId"=p."roomId" AND l.level=3;
UPDATE "RoomRocketProgress" p SET "cooldownUntil"=l."createdAt"+INTERVAL '3 minutes',dirty=true FROM "RoomRocketLaunch" l WHERE l."campaignId"=p."campaignId" AND l."roomId"=p."roomId" AND l.level=p.level-1 AND p."resetAt" IS NULL;
