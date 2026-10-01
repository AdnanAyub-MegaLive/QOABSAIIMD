-- Add explicit home-banner placement and deterministic catalogue ordering.
ALTER TABLE "UploadAsset"
ADD COLUMN "placement" TEXT,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Legacy banners belong to the Party placement. Non-banner assets never have
-- a placement.
UPDATE "UploadAsset"
SET "placement" = 'PARTY'
WHERE "category" = 'BANNERS';

-- Older portal versions accepted HTTP links. They are cleared instead of
-- exposing a destination that no longer meets the HTTPS-only contract.
UPDATE "UploadAsset"
SET "actionUrl" = NULL
WHERE "category" = 'BANNERS'
  AND "actionUrl" IS NOT NULL
  AND "actionUrl" !~* '^https://';

CREATE INDEX "UploadAsset_category_placement_active_isGlobal_sortOrder_createdAt_idx"
ON "UploadAsset"("category", "placement", "active", "isGlobal", "sortOrder", "createdAt");
