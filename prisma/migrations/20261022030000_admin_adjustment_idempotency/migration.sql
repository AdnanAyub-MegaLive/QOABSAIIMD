-- Additive only: no changes to existing users, balances or ledger history.
CREATE TABLE "AdminCoinAdjustmentRequest" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminCoinAdjustmentRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminCoinAdjustmentRequest_adminId_requestId_key" ON "AdminCoinAdjustmentRequest"("adminId", "requestId");
