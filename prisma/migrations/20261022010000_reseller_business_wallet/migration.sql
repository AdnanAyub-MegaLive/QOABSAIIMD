ALTER TABLE "User" ADD COLUMN "resellerCoinBalance" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_resellerCoinBalance_nonnegative" CHECK ("resellerCoinBalance" >= 0);
CREATE TABLE "ResellerRechargeRequest" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ResellerRechargeRequest_actorId_requestId_key" ON "ResellerRechargeRequest"("actorId", "requestId");
