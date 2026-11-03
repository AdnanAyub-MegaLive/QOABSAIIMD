ALTER TABLE "GiftTransaction" ADD COLUMN "operationKey" VARCHAR(128);
CREATE INDEX "GiftTransaction_senderId_operationKey_idx" ON "GiftTransaction"("senderId", "operationKey");
