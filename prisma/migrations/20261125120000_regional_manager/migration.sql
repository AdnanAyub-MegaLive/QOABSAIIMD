ALTER TABLE "Admin" ADD COLUMN "allowedCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "maxGrantDays" INTEGER,
  ADD COLUMN "linkedUserPublicId" TEXT;
ALTER TABLE "User" ADD COLUMN "walletFrozen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "walletFrozenReason" TEXT,
  ADD COLUMN "walletFrozenAt" TIMESTAMP(3),
  ADD COLUMN "walletFrozenByAdminId" TEXT,
  ADD COLUMN "grantedPrivileges" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "disabledGrantedPrivileges" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "WalletFreezeEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "frozen" BOOLEAN NOT NULL,
  "reason" TEXT NOT NULL,
  "adminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletFreezeEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WalletFreezeEvent_userId_createdAt_idx" ON "WalletFreezeEvent"("userId", "createdAt");

-- Wallet freeze: a frozen user cannot spend coins or diamonds. Receiving and
-- admin adjustments/refunds still work. Enforced here so every spend path,
-- present or future, is covered.
CREATE OR REPLACE FUNCTION mega_block_frozen_user_spend() RETURNS trigger AS $$
BEGIN
  IF NEW."walletFrozen" AND OLD."walletFrozen"
     AND (NEW."coinBalance" < OLD."coinBalance" OR NEW."resellerCoinBalance" < OLD."resellerCoinBalance" OR NEW."hostSalaryCoinBalance" < OLD."hostSalaryCoinBalance")
     AND coalesce(current_setting('mega.wallet_admin', true), '') <> 'on' THEN
    RAISE EXCEPTION 'WALLET_FROZEN' USING ERRCODE = 'P0001', HINT = 'Your wallet is frozen. Contact support.';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "User_wallet_freeze" BEFORE UPDATE OF "coinBalance", "resellerCoinBalance", "hostSalaryCoinBalance" ON "User"
  FOR EACH ROW EXECUTE FUNCTION mega_block_frozen_user_spend();

CREATE OR REPLACE FUNCTION mega_block_frozen_ledger_debit() RETURNS trigger AS $$
BEGIN
  IF NEW."direction" = 'DEBIT' AND NEW."type" NOT IN ('ADMIN_ADJUSTMENT', 'REFUND')
     AND coalesce(current_setting('mega.wallet_admin', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM "User" WHERE id = NEW."userId" AND "walletFrozen") THEN
    RAISE EXCEPTION 'WALLET_FROZEN' USING ERRCODE = 'P0001', HINT = 'Your wallet is frozen. Contact support.';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "WalletTransaction_wallet_freeze" BEFORE INSERT ON "WalletTransaction"
  FOR EACH ROW EXECUTE FUNCTION mega_block_frozen_ledger_debit();
