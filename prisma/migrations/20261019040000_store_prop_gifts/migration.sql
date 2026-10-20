ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'STORE_GIFT_SENT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'STORE_GIFT_RECEIVED';
ALTER TABLE "UploadAssetAssignment" ADD COLUMN "giftedByUserId" TEXT;
CREATE TABLE "PropGift" (
 "id" TEXT NOT NULL PRIMARY KEY, "publicId" TEXT NOT NULL,
 "senderUserId" TEXT NOT NULL, "recipientUserId" TEXT NOT NULL,
 "recipientPublicId" TEXT NOT NULL, "assetPublicId" TEXT NOT NULL,
 "requestId" TEXT NOT NULL, "price" BIGINT NOT NULL, "result" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PropGift_publicId_key" ON "PropGift"("publicId");
CREATE UNIQUE INDEX "PropGift_senderUserId_requestId_key" ON "PropGift"("senderUserId", "requestId");
CREATE INDEX "PropGift_recipientUserId_createdAt_idx" ON "PropGift"("recipientUserId", "createdAt");
