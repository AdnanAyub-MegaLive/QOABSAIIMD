ALTER TABLE "DailyTaskDefinition" ADD COLUMN "metric" TEXT, ADD COLUMN "config" JSONB, ADD COLUMN "rewardSpec" JSONB;
ALTER TABLE "DailyTaskInstance" ADD COLUMN "claimResult" JSONB, ADD COLUMN "evidence" TEXT, ADD COLUMN "reviewStatus" TEXT, ADD COLUMN "reviewReason" TEXT;
CREATE TABLE "TaskTimerCursor" ("userId" TEXT NOT NULL PRIMARY KEY, "sampledAt" TIMESTAMP(3) NOT NULL);
