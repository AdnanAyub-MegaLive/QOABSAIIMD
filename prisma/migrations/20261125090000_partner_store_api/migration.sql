CREATE TYPE "AssetPreviewKind" AS ENUM ('POSTER', 'MOTION');

CREATE TABLE "PartnerApiKey" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    CONSTRAINT "PartnerApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerApiKey_publicId_key" ON "PartnerApiKey"("publicId");
CREATE UNIQUE INDEX "PartnerApiKey_keyHash_key" ON "PartnerApiKey"("keyHash");
CREATE INDEX "PartnerApiKey_active_createdAt_idx" ON "PartnerApiKey"("active", "createdAt");

CREATE TABLE "AssetPreview" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "AssetPreviewKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA,
    "storageKey" TEXT,
    "sourceVersion" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssetPreview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetPreview_assetId_kind_key" ON "AssetPreview"("assetId", "kind");

ALTER TABLE "AssetPreview" ADD CONSTRAINT "AssetPreview_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "UploadAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PartnerCatalogRemoval" (
    "id" TEXT NOT NULL,
    "assetPublicId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerCatalogRemoval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerCatalogRemoval_removedAt_idx" ON "PartnerCatalogRemoval"("removedAt");

CREATE OR REPLACE FUNCTION partner_catalog_removal() RETURNS trigger AS $$
DECLARE
    was_listed BOOLEAN;
    is_listed BOOLEAN := FALSE;
    renamed BOOLEAN := FALSE;
BEGIN
    was_listed := OLD."active" AND OLD."archivedAt" IS NULL AND OLD."storeVisible" AND OLD."category" <> 'BANNERS';
    IF TG_OP = 'UPDATE' THEN
        is_listed := NEW."active" AND NEW."archivedAt" IS NULL AND NEW."storeVisible" AND NEW."category" <> 'BANNERS';
        renamed := NEW."publicId" IS DISTINCT FROM OLD."publicId";
    END IF;
    IF was_listed AND (NOT is_listed OR renamed) THEN
        INSERT INTO "PartnerCatalogRemoval" ("id", "assetPublicId", "removedAt") VALUES (gen_random_uuid()::text, OLD."publicId", clock_timestamp());
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UploadAsset_partner_catalog_removal"
AFTER UPDATE OR DELETE ON "UploadAsset"
FOR EACH ROW EXECUTE FUNCTION partner_catalog_removal();
