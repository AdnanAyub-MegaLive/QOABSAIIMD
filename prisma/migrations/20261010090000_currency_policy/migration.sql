CREATE TABLE "CurrencyPolicy" (
 "id" TEXT NOT NULL DEFAULT 'GLOBAL', "version" INTEGER NOT NULL DEFAULT 1,
 "rules" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CurrencyPolicy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CurrencyRequest" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "idempotencyKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "diamonds" BIGINT NOT NULL, "quotedCoins" BIGINT NOT NULL DEFAULT 0,
 "netUsdtMicros" BIGINT NOT NULL DEFAULT 0, "recipientPublicId" TEXT,
 "destination" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "policySnapshot" JSONB NOT NULL,
 "reviewNote" TEXT, "reviewedBy" TEXT, "payoutHash" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CurrencyRequest_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "CurrencyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CurrencyRequest_userId_idempotencyKey_key" ON "CurrencyRequest"("userId","idempotencyKey");
CREATE UNIQUE INDEX "CurrencyRequest_payoutHash_key" ON "CurrencyRequest"("payoutHash");
CREATE INDEX "CurrencyRequest_status_createdAt_idx" ON "CurrencyRequest"("status","createdAt");
ALTER TABLE "GiftSettlement" ADD COLUMN "recipientDiamonds" BIGINT, ADD COLUMN "currencyPolicyVersion" INTEGER;
