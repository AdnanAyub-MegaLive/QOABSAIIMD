CREATE TABLE "GiftLeaveGraceSettings" (
    "id" TEXT NOT NULL DEFAULT 'DEFAULT',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftLeaveGraceSettings_pkey" PRIMARY KEY ("id")
);
