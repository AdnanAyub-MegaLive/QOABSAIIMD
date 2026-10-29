CREATE TABLE "GlobalAnnouncementPolicy" (
  "id" TEXT PRIMARY KEY DEFAULT 'GLOBAL', "rules" JSONB NOT NULL,
  "cooldownSeconds" INTEGER NOT NULL DEFAULT 10, "lifetimeSeconds" INTEGER NOT NULL DEFAULT 60,
  "revision" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "GlobalAnnouncement" (
  "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "type" TEXT NOT NULL, "roomId" TEXT NOT NULL,
  "payload" JSONB, "sourceIds" TEXT[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL, "deliveredAt" TIMESTAMP(3), "leaseUntil" TIMESTAMP(3)
);
CREATE INDEX "GlobalAnnouncement_actorId_type_createdAt_idx" ON "GlobalAnnouncement"("actorId", "type", "createdAt");
CREATE INDEX "GlobalAnnouncement_deliveredAt_expiresAt_idx" ON "GlobalAnnouncement"("deliveredAt", "expiresAt");
CREATE INDEX "GiftRecoverySnapshot_createdAt_idx" ON "GiftRecoverySnapshot"("createdAt");
CREATE INDEX "SharedGameEntry_settledAt_idx" ON "SharedGameEntry"("settledAt");
