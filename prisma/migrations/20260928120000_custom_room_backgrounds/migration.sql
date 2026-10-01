ALTER TYPE "WalletTransactionType" ADD VALUE 'CUSTOM_BACKGROUND_PURCHASE';
ALTER TYPE "WalletTransactionType" ADD VALUE 'CUSTOM_BACKGROUND_REFUND';

CREATE TYPE "CustomBackgroundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "CustomRoomBackgroundSettings" (
  "id" TEXT NOT NULL DEFAULT 'DEFAULT', "enabled" BOOLEAN NOT NULL DEFAULT true,
  "maxBytes" INTEGER NOT NULL DEFAULT 5242880,
  "allowedMimeTypes" TEXT[] DEFAULT ARRAY['image/jpeg','image/png','image/webp']::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomRoomBackgroundSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomRoomBackgroundPrice" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "durationDays" INTEGER NOT NULL,
  "coins" BIGINT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomRoomBackgroundPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomRoomBackgroundRequest" (
  "id" TEXT NOT NULL, "publicId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "userId" TEXT NOT NULL, "priceId" TEXT, "priceName" TEXT NOT NULL,
  "durationDays" INTEGER NOT NULL, "coins" BIGINT NOT NULL,
  "status" "CustomBackgroundStatus" NOT NULL DEFAULT 'PENDING',
  "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "fileSize" INTEGER NOT NULL,
  "fileData" BYTEA NOT NULL, "rejectionReason" TEXT, "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3), "reviewedByAdminId" TEXT, "approvedAssetId" TEXT,
  CONSTRAINT "CustomRoomBackgroundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomRoomBackgroundRequest_publicId_key" ON "CustomRoomBackgroundRequest"("publicId");
CREATE UNIQUE INDEX "CustomRoomBackgroundRequest_approvedAssetId_key" ON "CustomRoomBackgroundRequest"("approvedAssetId");
CREATE UNIQUE INDEX "CustomRoomBackgroundRequest_userId_requestId_key" ON "CustomRoomBackgroundRequest"("userId", "requestId");
CREATE INDEX "CustomRoomBackgroundPrice_active_sortOrder_idx" ON "CustomRoomBackgroundPrice"("active", "sortOrder");
CREATE INDEX "CustomRoomBackgroundRequest_userId_submittedAt_idx" ON "CustomRoomBackgroundRequest"("userId", "submittedAt");
CREATE INDEX "CustomRoomBackgroundRequest_status_submittedAt_idx" ON "CustomRoomBackgroundRequest"("status", "submittedAt");

ALTER TABLE "CustomRoomBackgroundRequest" ADD CONSTRAINT "CustomRoomBackgroundRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomRoomBackgroundRequest" ADD CONSTRAINT "CustomRoomBackgroundRequest_priceId_fkey" FOREIGN KEY ("priceId") REFERENCES "CustomRoomBackgroundPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomRoomBackgroundRequest" ADD CONSTRAINT "CustomRoomBackgroundRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomRoomBackgroundRequest" ADD CONSTRAINT "CustomRoomBackgroundRequest_approvedAssetId_fkey" FOREIGN KEY ("approvedAssetId") REFERENCES "UploadAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "CustomRoomBackgroundSettings" ("id", "enabled", "maxBytes", "allowedMimeTypes", "updatedAt") VALUES ('DEFAULT', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'], CURRENT_TIMESTAMP);
INSERT INTO "CustomRoomBackgroundPrice" ("id", "name", "durationDays", "coins", "sortOrder", "active", "updatedAt") VALUES
('PRICE-30D', '30 Days', 30, 5000, 10, true, CURRENT_TIMESTAMP),
('PRICE-90D', '90 Days', 90, 12000, 20, true, CURRENT_TIMESTAMP);
