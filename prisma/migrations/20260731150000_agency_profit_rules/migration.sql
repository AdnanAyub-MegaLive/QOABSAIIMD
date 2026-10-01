CREATE TABLE "Agency" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "commissionCoinBalance" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Agency_publicId_key" ON "Agency"("publicId");
CREATE UNIQUE INDEX "Agency_ownerUserId_key" ON "Agency"("ownerUserId");
CREATE INDEX "Agency_status_createdAt_idx" ON "Agency"("status", "createdAt");

CREATE TABLE "ProfitSplitRule" (
  "id" TEXT NOT NULL DEFAULT 'GLOBAL',
  "hostShareBps" INTEGER NOT NULL DEFAULT 4000,
  "agencyShareBps" INTEGER NOT NULL DEFAULT 2000,
  "companyShareBps" INTEGER NOT NULL DEFAULT 4000,
  "normalUserReusableShareBps" INTEGER NOT NULL DEFAULT 4000,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfitSplitRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProfitSplitRule_updatedAt_idx" ON "ProfitSplitRule"("updatedAt");

INSERT INTO "ProfitSplitRule" ("id") VALUES ('GLOBAL');
INSERT INTO "Agency" ("id", "publicId", "name", "status")
VALUES ('agency_legacy_hosts', 'AGY-LEGACY', 'Legacy Host Agency', 'ACTIVE');

ALTER TABLE "User"
  ADD COLUMN "agencyId" TEXT,
  ADD COLUMN "hostSalaryCoinBalance" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Talent"
  ADD COLUMN "agencyId" TEXT,
  ADD COLUMN "hostSalaryCoinBalance" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AgencyApplication" ADD COLUMN "agencyId" TEXT;
ALTER TABLE "GiftTransaction"
  ALTER COLUMN "talentId" DROP NOT NULL,
  ADD COLUMN "recipientUserId" TEXT;

UPDATE "Talent" SET "agencyId" = 'agency_legacy_hosts' WHERE "agencyId" IS NULL;
UPDATE "User" SET "agencyId" = 'agency_legacy_hosts' WHERE "role" = 'HOST' AND "agencyId" IS NULL;
ALTER TABLE "Talent" ALTER COLUMN "agencyId" SET NOT NULL;

CREATE UNIQUE INDEX "AgencyApplication_agencyId_key" ON "AgencyApplication"("agencyId");
CREATE INDEX "User_agencyId_idx" ON "User"("agencyId");
CREATE INDEX "Talent_agencyId_idx" ON "Talent"("agencyId");
CREATE INDEX "GiftTransaction_recipientUserId_createdAt_idx" ON "GiftTransaction"("recipientUserId", "createdAt");

ALTER TABLE "Agency" ADD CONSTRAINT "Agency_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Talent" ADD CONSTRAINT "Talent_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgencyApplication" ADD CONSTRAINT "AgencyApplication_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GiftSettlement" (
  "id" TEXT NOT NULL,
  "giftTransactionId" TEXT NOT NULL,
  "agencyId" TEXT,
  "recipientType" TEXT NOT NULL,
  "grossCoins" BIGINT NOT NULL,
  "hostSalaryCoins" BIGINT NOT NULL DEFAULT 0,
  "agencyCoins" BIGINT NOT NULL DEFAULT 0,
  "companyCoins" BIGINT NOT NULL DEFAULT 0,
  "reusableCoins" BIGINT NOT NULL DEFAULT 0,
  "hostShareBps" INTEGER NOT NULL,
  "agencyShareBps" INTEGER NOT NULL,
  "companyShareBps" INTEGER NOT NULL,
  "reusableShareBps" INTEGER NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftSettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GiftSettlement_giftTransactionId_key" ON "GiftSettlement"("giftTransactionId");
CREATE INDEX "GiftSettlement_agencyId_createdAt_idx" ON "GiftSettlement"("agencyId", "createdAt");
CREATE INDEX "GiftSettlement_recipientType_createdAt_idx" ON "GiftSettlement"("recipientType", "createdAt");
ALTER TABLE "GiftSettlement" ADD CONSTRAINT "GiftSettlement_giftTransactionId_fkey" FOREIGN KEY ("giftTransactionId") REFERENCES "GiftTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GiftSettlement" ADD CONSTRAINT "GiftSettlement_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
