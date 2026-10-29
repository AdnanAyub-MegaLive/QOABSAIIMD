CREATE TABLE "NewUserRewardPolicy" (
 "id" SERIAL PRIMARY KEY, "enabled" BOOLEAN NOT NULL,
 "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "rewards" JSONB NOT NULL
);
CREATE INDEX "NewUserRewardPolicy_effectiveFrom_id_idx" ON "NewUserRewardPolicy"("effectiveFrom", "id");
CREATE TABLE "NewUserRewardClaim" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "day" INTEGER NOT NULL CHECK ("day" BETWEEN 1 AND 7),
 "policyId" INTEGER NOT NULL REFERENCES "NewUserRewardPolicy"("id") ON DELETE RESTRICT,
 "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "result" JSONB NOT NULL
);
CREATE UNIQUE INDEX "NewUserRewardClaim_userId_day_key" ON "NewUserRewardClaim"("userId", "day");
-- No policy seed or backfill: no existing accounts are enrolled.
