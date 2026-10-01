ALTER TABLE "GiftTransaction" ADD COLUMN "giftBatchId" VARCHAR(64);
CREATE INDEX "GiftTransaction_senderId_giftBatchId_idx" ON "GiftTransaction"("senderId", "giftBatchId");
