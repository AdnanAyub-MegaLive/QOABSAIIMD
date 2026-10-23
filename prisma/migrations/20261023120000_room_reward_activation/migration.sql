-- Restore service access to existing reward tables via Prisma schema only.
-- Never update old policies, receipts, payouts, ledgers or balances.
CREATE TABLE "RoomRewardActivation" (
  "id" TEXT PRIMARY KEY,
  "startsAt" TIMESTAMP(3) NOT NULL
);
-- A durable deployment fence: restarting must not move it or backfill older days.
INSERT INTO "RoomRewardActivation" ("id", "startsAt")
VALUES ('GLOBAL', date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 day');
