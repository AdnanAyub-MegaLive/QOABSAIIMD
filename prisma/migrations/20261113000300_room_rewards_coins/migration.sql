-- Additive for live deployments. Old paid receipts remain Diamonds. The new
-- payout transaction converts unpaid snapshots to Coins atomically with credit.
ALTER TABLE "RoomRewardPayout" ADD COLUMN "coins" BIGINT;
ALTER TABLE "RoomRewardPayout" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'DIAMONDS';
