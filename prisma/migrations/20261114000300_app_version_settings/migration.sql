CREATE TABLE "AppVersionSettings" (
  "id" TEXT NOT NULL DEFAULT 'GLOBAL',
  "forceUpdateEnabled" BOOLEAN NOT NULL DEFAULT false,
  "androidMinVersionCode" INTEGER NOT NULL DEFAULT 1,
  "androidLatestVersionName" TEXT NOT NULL DEFAULT '',
  "androidStoreUrl" TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.megachat.megalive',
  "updateMessage" TEXT NOT NULL DEFAULT 'A new version of MegaLive is available. Please update MegaLive from the Play Store to continue.',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppVersionSettings_pkey" PRIMARY KEY ("id")
);
