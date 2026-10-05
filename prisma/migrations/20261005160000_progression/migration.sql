-- CreateTable
CREATE TABLE "ProgressionConfiguration" (
    "version" SERIAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressionConfiguration_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "LevelDefinition" (
    "id" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "configurationVersion" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "thresholdPoints" BIGINT NOT NULL,
    "badgeAssetId" TEXT,
    "benefits" JSONB NOT NULL,

    CONSTRAINT "LevelDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgress" (
    "userId" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "configurationVersion" INTEGER NOT NULL,
    "lifetimePoints" BIGINT NOT NULL DEFAULT 0,
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("userId","track")
);

-- CreateTable
CREATE TABLE "ProgressLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "deltaPoints" BIGINT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL DEFAULT '',
    "ruleVersion" INTEGER NOT NULL,
    "eligibleAmount" BIGINT NOT NULL,
    "numerator" BIGINT NOT NULL,
    "denominator" BIGINT NOT NULL,
    "basis" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftRequest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealtimeOutbox" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RealtimeOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LevelDefinition_track_configurationVersion_level_key" ON "LevelDefinition"("track", "configurationVersion", "level");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressLedger_reversalOfId_key" ON "ProgressLedger"("reversalOfId");

-- CreateIndex
CREATE INDEX "ProgressLedger_userId_track_createdAt_id_idx" ON "ProgressLedger"("userId", "track", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressLedger_userId_track_sourceType_sourceId_sourceLineI_key" ON "ProgressLedger"("userId", "track", "sourceType", "sourceId", "sourceLineId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftRequest_senderId_key_key" ON "GiftRequest"("senderId", "key");

-- CreateIndex
CREATE INDEX "RealtimeOutbox_deliveredAt_createdAt_idx" ON "RealtimeOutbox"("deliveredAt", "createdAt");

ALTER TABLE "LevelDefinition" ADD CONSTRAINT "LevelDefinition_configurationVersion_fkey" FOREIGN KEY ("configurationVersion") REFERENCES "ProgressionConfiguration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_configurationVersion_fkey" FOREIGN KEY ("configurationVersion") REFERENCES "ProgressionConfiguration"("version") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgressLedger" ADD CONSTRAINT "ProgressLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GiftRequest" ADD CONSTRAINT "GiftRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ProgressionConfiguration_one_active" ON "ProgressionConfiguration" ("active") WHERE "active" = true;
ALTER TABLE "LevelDefinition" ADD CHECK ("track" IN ('USER','CHARM') AND "thresholdPoints" >= 0 AND "level" >= 0);
ALTER TABLE "UserProgress" ADD CHECK ("track" IN ('USER','CHARM') AND "lifetimePoints" >= 0);
ALTER TABLE "ProgressLedger" ADD CHECK ("track" IN ('USER','CHARM') AND "denominator" > 0 AND "numerator" >= 0);
INSERT INTO "ProgressionConfiguration" ("enabled","active","rules") VALUES (false,true,'[]');
INSERT INTO "LevelDefinition" ("id","track","configurationVersion","level","thresholdPoints","benefits") SELECT 'initial-' || t, t, currval('"ProgressionConfiguration_version_seq"'),0,0,'[]'::jsonb FROM unnest(ARRAY['USER','CHARM']) t;

