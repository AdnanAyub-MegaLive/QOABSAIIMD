CREATE TABLE "RoomRewardPolicy" (
 "version" SERIAL PRIMARY KEY, "rateBps" INTEGER NOT NULL DEFAULT 200 CHECK ("rateBps" BETWEEN 0 AND 10000),
 "enabled" BOOLEAN NOT NULL DEFAULT true, "effectiveFrom" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- First eligible day is the next full UTC day after deployment; never backfill.
INSERT INTO "RoomRewardPolicy" ("effectiveFrom") VALUES (date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day');
CREATE TABLE "RoomRewardDay" ("day" TIMESTAMP(3) PRIMARY KEY, "policyVersion" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "RoomRewardPayout" (
 "id" TEXT PRIMARY KEY, "day" TIMESTAMP(3) NOT NULL, "roomId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
 "policyVersion" INTEGER NOT NULL, "rateBps" INTEGER NOT NULL, "giftCoins" BIGINT NOT NULL, "giftIds" JSONB NOT NULL,
 "diamonds" BIGINT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "error" TEXT,
 "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RoomRewardPayout_day_roomId_key" ON "RoomRewardPayout"("day", "roomId");
CREATE INDEX "RoomRewardPayout_status_day_idx" ON "RoomRewardPayout"("status", "day");
