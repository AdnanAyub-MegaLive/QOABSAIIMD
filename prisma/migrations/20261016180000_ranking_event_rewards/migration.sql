CREATE TABLE "RankingRewardPolicy" (
 "id" TEXT PRIMARY KEY, "eventSlug" TEXT NOT NULL, "track" TEXT NOT NULL,
 "period" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false,
 "effectiveFrom" TIMESTAMP(3) NOT NULL, "rewards" JSONB NOT NULL,
 "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RankingRewardPolicy_eventSlug_period_effectiveFrom_idx" ON "RankingRewardPolicy"("eventSlug","period","effectiveFrom");
CREATE TABLE "RankingRewardRound" (
 "id" TEXT PRIMARY KEY, "eventSlug" TEXT NOT NULL, "period" TEXT NOT NULL,
 "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
 "policyId" TEXT NOT NULL, "winners" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "error" TEXT, "awardedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RankingRewardRound_eventSlug_period_startsAt_key" ON "RankingRewardRound"("eventSlug","period","startsAt");
CREATE INDEX "RankingRewardRound_status_endsAt_idx" ON "RankingRewardRound"("status","endsAt");
