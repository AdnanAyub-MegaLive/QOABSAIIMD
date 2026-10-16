ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'ROOM_BANNER_PURCHASE';
ALTER TABLE "AudioRoom" ADD COLUMN "bannerRevision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "bannerBroadcastRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "RoomBannerSettings" ("id" TEXT PRIMARY KEY, "enabled" BOOLEAN NOT NULL DEFAULT false, "packages" JSONB NOT NULL DEFAULT '[]', "revision" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE "RoomBanner" (
 "id" TEXT PRIMARY KEY, "audioRoomId" TEXT NOT NULL REFERENCES "AudioRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "position" INTEGER NOT NULL CHECK ("position" BETWEEN 1 AND 2), "coins" BIGINT NOT NULL CHECK ("coins" > 0),
 "durationDays" INTEGER NOT NULL, "packageName" TEXT NOT NULL, "storageKey" TEXT NOT NULL,
 "publicKey" TEXT, "imageUrl" TEXT, "mimeType" TEXT NOT NULL, "mediaVersion" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3), "reviewedAt" TIMESTAMP(3), "remindedAt" TIMESTAMP(3), "reason" TEXT, "refundedAt" TIMESTAMP(3),
 CONSTRAINT "RoomBanner_status_check" CHECK ("status" IN ('PENDING','ACTIVE','REJECTED','EXPIRED','DELETED'))
);
CREATE UNIQUE INDEX "RoomBanner_ownerId_requestId_key" ON "RoomBanner"("ownerId","requestId");
CREATE INDEX "RoomBanner_audioRoomId_status_expiresAt_idx" ON "RoomBanner"("audioRoomId","status","expiresAt");
CREATE INDEX "RoomBanner_status_expiresAt_idx" ON "RoomBanner"("status","expiresAt");
CREATE TABLE "RoomBannerObject" ("key" TEXT PRIMARY KEY, "checkAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "RoomBannerObject_checkAt_idx" ON "RoomBannerObject"("checkAt");
