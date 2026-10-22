ALTER TABLE "UploadAssetAssignment" ADD COLUMN "renewedAt" TIMESTAMP(3);
ALTER TABLE "PropPurchase" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PURCHASE', ADD COLUMN "requestKey" TEXT, ADD COLUMN "result" JSONB;
CREATE UNIQUE INDEX "PropPurchase_userId_requestKey_key" ON "PropPurchase"("userId", "requestKey");
