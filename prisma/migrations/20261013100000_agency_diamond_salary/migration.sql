CREATE TABLE "AgencySalaryPolicy" (
  "month" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 1,
  "tiers" JSONB NOT NULL,
  "diamondsPerUsd" BIGINT NOT NULL DEFAULT 90000,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
