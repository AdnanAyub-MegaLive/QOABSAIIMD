ALTER TABLE "AppVersionSettings" ADD COLUMN "minorUpdateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppVersionSettings" ADD COLUMN "androidRecommendedVersionCode" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AppVersionSettings" ADD COLUMN "minorUpdateMessage" TEXT NOT NULL DEFAULT 'A new version of MegaLive is available with improvements. Update now for the best experience.';
