ALTER TABLE "AudioRoom" ADD COLUMN "roomFrameAssetId" TEXT, ADD COLUMN "roomFrameVersion" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "AudioRoom_roomFrameAssetId_idx" ON "AudioRoom"("roomFrameAssetId");
ALTER TABLE "AudioRoom" ADD CONSTRAINT "AudioRoom_roomFrameAssetId_fkey" FOREIGN KEY ("roomFrameAssetId") REFERENCES "UploadAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
