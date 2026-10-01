ALTER TABLE "UploadAsset"
  ADD COLUMN "distribution" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "storeVisible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "coinPrice" BIGINT,
  ADD COLUMN "minimumVipLevel" INTEGER,
  ADD COLUMN "minimumRecharge" BIGINT,
  ADD COLUMN "defaultGrantDurationMinutes" INTEGER,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "UploadAssetAssignment"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "sourceReference" TEXT,
  ADD COLUMN "purchasePrice" BIGINT;

CREATE TABLE "UserEquippedProp" (
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "assetId" TEXT,
  "assetPublicId" TEXT NOT NULL,
  "assetName" TEXT NOT NULL,
  "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserEquippedProp_pkey" PRIMARY KEY ("userId", "category")
);

CREATE INDEX "UploadAsset_storeVisible_active_createdAt_idx"
  ON "UploadAsset"("storeVisible", "active", "createdAt");
CREATE INDEX "UploadAsset_distribution_active_idx"
  ON "UploadAsset"("distribution", "active");
CREATE INDEX "UploadAssetAssignment_source_assignedAt_idx"
  ON "UploadAssetAssignment"("source", "assignedAt");
CREATE INDEX "UserEquippedProp_assetId_idx"
  ON "UserEquippedProp"("assetId");

ALTER TABLE "UserEquippedProp"
  ADD CONSTRAINT "UserEquippedProp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PropPurchase" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "price" BIGINT NOT NULL,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropPurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropPurchase_publicId_key" ON "PropPurchase"("publicId");
CREATE INDEX "PropPurchase_userId_purchasedAt_idx"
  ON "PropPurchase"("userId", "purchasedAt");
CREATE INDEX "PropPurchase_assetId_purchasedAt_idx"
  ON "PropPurchase"("assetId", "purchasedAt");

ALTER TABLE "PropPurchase"
  ADD CONSTRAINT "PropPurchase_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropPurchase"
  ADD CONSTRAINT "PropPurchase_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "UploadAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserEquippedProp"
  ADD CONSTRAINT "UserEquippedProp_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "UploadAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
