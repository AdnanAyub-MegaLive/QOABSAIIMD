ALTER TABLE "AudioRoom"
ADD COLUMN "seatStyleAssetId" TEXT,
ADD COLUMN "seatStyleVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "AudioRoom_seatStyleAssetId_idx" ON "AudioRoom"("seatStyleAssetId");

ALTER TABLE "AudioRoom"
ADD CONSTRAINT "AudioRoom_seatStyleAssetId_fkey"
FOREIGN KEY ("seatStyleAssetId") REFERENCES "UploadAsset"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
