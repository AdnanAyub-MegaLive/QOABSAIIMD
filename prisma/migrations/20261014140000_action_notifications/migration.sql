ALTER TABLE "Notification" ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "action" JSONB,
  ADD COLUMN "deliveredAt" TIMESTAMP(3);
-- Do not replay old announcements when the dispatcher first starts.
UPDATE "Notification" SET "deliveredAt" = "createdAt";
CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "Notification"("sourceKey");
CREATE INDEX "Notification_deliveredAt_createdAt_idx" ON "Notification"("deliveredAt", "createdAt");
CREATE TABLE "NotificationSettings" (
  "id" TEXT NOT NULL DEFAULT 'GLOBAL',
  "welcomeEnabled" BOOLEAN NOT NULL DEFAULT true,
  "welcomeTitle" TEXT NOT NULL DEFAULT 'Welcome to MegaLive!',
  "welcomeBody" TEXT NOT NULL DEFAULT 'Welcome to MegaLive! Explore rooms, meet people and enjoy your time with us.',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
