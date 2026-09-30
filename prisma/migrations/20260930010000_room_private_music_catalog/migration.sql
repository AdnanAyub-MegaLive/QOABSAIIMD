ALTER TABLE "UploadAsset" ADD COLUMN "audioRoomId" TEXT;

ALTER TABLE "UploadAsset"
ADD CONSTRAINT "UploadAsset_audioRoomId_fkey"
FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UploadAsset_audioRoomId_category_active_sortOrder_createdAt_idx"
ON "UploadAsset"("audioRoomId", "category", "active", "sortOrder", "createdAt");
