ALTER TABLE "UploadAsset" ADD COLUMN "receiverDiamonds" BIGINT;
ALTER TABLE "UploadAsset" ADD CONSTRAINT "UploadAsset_receiverDiamonds_range" CHECK ("receiverDiamonds" IS NULL OR "receiverDiamonds" BETWEEN 0 AND 1000000000000);
