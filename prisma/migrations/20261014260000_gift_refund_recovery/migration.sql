-- New records only. No historical balance, XP or gift updates.
CREATE TABLE "GiftRecoverySnapshot" (
  "giftId" TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "GiftRefund" (
  "giftId" TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  "reviewReason" TEXT,
  "adminId" TEXT NOT NULL,
  result JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
