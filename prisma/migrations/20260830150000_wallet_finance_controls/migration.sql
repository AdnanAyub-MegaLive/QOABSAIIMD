ALTER TYPE "WalletOrderStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "WalletOrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "WalletTopUpOrder"
ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "WalletWithdrawal"
ADD COLUMN "reviewedByAdminId" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "providerPayoutReference" TEXT;

CREATE UNIQUE INDEX "WalletTopUpOrder_userId_idempotencyKey_key"
ON "WalletTopUpOrder"("userId", "idempotencyKey");

CREATE UNIQUE INDEX "WalletWithdrawal_providerPayoutReference_key"
ON "WalletWithdrawal"("providerPayoutReference");

CREATE INDEX "WalletWithdrawal_reviewedByAdminId_reviewedAt_idx"
ON "WalletWithdrawal"("reviewedByAdminId", "reviewedAt");

ALTER TABLE "WalletWithdrawal"
ADD CONSTRAINT "WalletWithdrawal_reviewedByAdminId_fkey"
FOREIGN KEY ("reviewedByAdminId") REFERENCES "Admin"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
