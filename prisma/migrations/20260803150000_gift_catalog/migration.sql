ALTER TABLE "UploadAsset" ADD COLUMN "giftTier" TEXT;
ALTER TABLE "GiftTransaction" ADD COLUMN "giftAssetId" TEXT;

CREATE INDEX "GiftTransaction_giftAssetId_createdAt_idx"
ON "GiftTransaction"("giftAssetId", "createdAt");

ALTER TABLE "GiftTransaction"
ADD CONSTRAINT "GiftTransaction_giftAssetId_fkey"
FOREIGN KEY ("giftAssetId") REFERENCES "UploadAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
