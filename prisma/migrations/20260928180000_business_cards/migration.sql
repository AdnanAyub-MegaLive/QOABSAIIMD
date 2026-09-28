ALTER TABLE "UploadAsset" ADD COLUMN "posterFileName" TEXT;
ALTER TABLE "UploadAsset" ADD COLUMN "posterMimeType" TEXT;
ALTER TABLE "UploadAsset" ADD COLUMN "posterFileSize" INTEGER;
ALTER TABLE "UploadAsset" ADD COLUMN "posterFileData" BYTEA;
