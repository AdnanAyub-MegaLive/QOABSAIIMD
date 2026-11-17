ALTER TABLE "CsRoomPresence" ADD COLUMN "removedAt" TIMESTAMP(3);
CREATE TABLE "CsRoomBan" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CsRoomBan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CsRoomBan_country_userId_key" ON "CsRoomBan"("country", "userId");
CREATE INDEX "CsRoomBan_expiresAt_idx" ON "CsRoomBan"("expiresAt");
CREATE TABLE "CsRoomMute" (
    "country" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CsRoomMute_pkey" PRIMARY KEY ("country","userId")
);
