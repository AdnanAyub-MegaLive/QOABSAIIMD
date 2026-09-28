ALTER TABLE "AudioRoom"
ADD COLUMN "roomBackgroundAssetId" TEXT,
ADD COLUMN "roomBackgroundVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AudioRoom_roomBackgroundAssetId_idx" ON "AudioRoom"("roomBackgroundAssetId");
ALTER TABLE "AudioRoom" ADD CONSTRAINT "AudioRoom_roomBackgroundAssetId_fkey" FOREIGN KEY ("roomBackgroundAssetId") REFERENCES "UploadAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
