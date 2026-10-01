CREATE TABLE "RedEnvelopeSettings" (
  "id" TEXT NOT NULL DEFAULT 'DEFAULT',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "maxCoins" BIGINT NOT NULL DEFAULT 10000000,
  "maxShareCount" INTEGER NOT NULL DEFAULT 100,
  "maxDelaySeconds" INTEGER NOT NULL DEFAULT 300,
  "claimWindowSeconds" INTEGER NOT NULL DEFAULT 600,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RedEnvelopeSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RedEnvelopePreset" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "totalCoins" BIGINT NOT NULL,
  "shareCount" INTEGER NOT NULL,
  "delaySeconds" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RedEnvelopePreset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RedEnvelopePreset_active_sortOrder_idx" ON "RedEnvelopePreset"("active", "sortOrder");
INSERT INTO "RedEnvelopeSettings" ("id", "updatedAt") VALUES ('DEFAULT', CURRENT_TIMESTAMP);
INSERT INTO "RedEnvelopePreset" ("id", "name", "totalCoins", "shareCount", "delaySeconds", "sortOrder", "updatedAt") VALUES
('REDPRESET-QUICK', 'Quick Drop', 500, 5, 5, 10, CURRENT_TIMESTAMP),
('REDPRESET-PARTY', 'Party Pack', 2000, 10, 10, 20, CURRENT_TIMESTAMP),
('REDPRESET-MEGA', 'Mega Rain', 10000, 20, 15, 30, CURRENT_TIMESTAMP);
