CREATE TYPE "WalletTransactionType" AS ENUM ('COIN_TOP_UP', 'DIAMOND_TOP_UP', 'GIFT_SENT', 'GIFT_RECEIVED', 'STORE_PURCHASE', 'REFUND', 'TRANSFER_SENT', 'TRANSFER_RECEIVED', 'WITHDRAWAL', 'BONUS', 'ADMIN_ADJUSTMENT');
CREATE TYPE "WalletDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');
CREATE TYPE "WalletOrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "User" ADD COLUMN "couponBalance" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "WalletCoinPackage" (
  "id" TEXT NOT NULL,
  "coins" BIGINT NOT NULL,
  "bonusPercent" INTEGER NOT NULL DEFAULT 0,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PKR',
  "bestValue" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletCoinPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletTopUpOrder" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "baseCoins" BIGINT NOT NULL,
  "bonusCoins" BIGINT NOT NULL,
  "totalCoins" BIGINT NOT NULL,
  "status" "WalletOrderStatus" NOT NULL DEFAULT 'PENDING',
  "providerReference" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletTopUpOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletWithdrawal" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "coins" BIGINT NOT NULL,
  "cashAmount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "status" "WalletOrderStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "WalletWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "WalletTransactionType" NOT NULL,
  "direction" "WalletDirection" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coins" BIGINT,
  "diamonds" BIGINT,
  "cashAmount" DECIMAL(12,2),
  "currency" TEXT,
  "status" "WalletTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "referenceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletTopUpOrder_publicId_key" ON "WalletTopUpOrder"("publicId");
CREATE UNIQUE INDEX "WalletTopUpOrder_providerReference_key" ON "WalletTopUpOrder"("providerReference");
CREATE INDEX "WalletTopUpOrder_userId_createdAt_idx" ON "WalletTopUpOrder"("userId", "createdAt");
CREATE INDEX "WalletTopUpOrder_status_expiresAt_idx" ON "WalletTopUpOrder"("status", "expiresAt");
CREATE UNIQUE INDEX "WalletWithdrawal_publicId_key" ON "WalletWithdrawal"("publicId");
CREATE INDEX "WalletWithdrawal_userId_createdAt_idx" ON "WalletWithdrawal"("userId", "createdAt");
CREATE INDEX "WalletWithdrawal_status_createdAt_idx" ON "WalletWithdrawal"("status", "createdAt");
CREATE UNIQUE INDEX "WalletTransaction_publicId_key" ON "WalletTransaction"("publicId");
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");
CREATE INDEX "WalletTransaction_referenceId_idx" ON "WalletTransaction"("referenceId");
CREATE INDEX "WalletTransaction_type_createdAt_idx" ON "WalletTransaction"("type", "createdAt");
CREATE UNIQUE INDEX "WalletTransaction_userId_type_referenceId_key" ON "WalletTransaction"("userId", "type", "referenceId");
CREATE INDEX "WalletCoinPackage_active_sortOrder_idx" ON "WalletCoinPackage"("active", "sortOrder");

ALTER TABLE "WalletTopUpOrder" ADD CONSTRAINT "WalletTopUpOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTopUpOrder" ADD CONSTRAINT "WalletTopUpOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "WalletCoinPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletWithdrawal" ADD CONSTRAINT "WalletWithdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "WalletCoinPackage" ("id", "coins", "bonusPercent", "price", "currency", "bestValue", "active", "sortOrder", "updatedAt") VALUES
  ('COIN_1000', 1000, 0, 50, 'PKR', false, true, 10, CURRENT_TIMESTAMP),
  ('COIN_5000', 5000, 5, 240, 'PKR', false, true, 20, CURRENT_TIMESTAMP),
  ('COIN_10000', 10000, 10, 460, 'PKR', false, true, 30, CURRENT_TIMESTAMP),
  ('COIN_25000', 25000, 20, 1050, 'PKR', true, true, 40, CURRENT_TIMESTAMP),
  ('COIN_50000', 50000, 25, 2000, 'PKR', false, true, 50, CURRENT_TIMESTAMP);

CREATE FUNCTION prevent_wallet_transaction_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'WalletTransaction is an immutable ledger; append a reversal instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletTransaction_immutable"
BEFORE UPDATE OR DELETE ON "WalletTransaction"
FOR EACH ROW EXECUTE FUNCTION prevent_wallet_transaction_mutation();
