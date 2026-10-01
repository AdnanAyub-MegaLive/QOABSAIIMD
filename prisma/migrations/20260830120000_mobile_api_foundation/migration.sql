CREATE TYPE "LegacyEntityType" AS ENUM ('USER', 'AUDIO_ROOM');

CREATE TABLE "LegacyIdMapping" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MEGACHAT_LEGACY',
    "entityType" "LegacyEntityType" NOT NULL,
    "legacyId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT,
    "audioRoomId" TEXT,
    "metadata" JSONB,
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyIdMapping_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LegacyIdMapping_entity_target_check" CHECK (
      ("entityType" = 'USER' AND "userId" IS NOT NULL AND "audioRoomId" IS NULL)
      OR
      ("entityType" = 'AUDIO_ROOM' AND "audioRoomId" IS NOT NULL AND "userId" IS NULL)
    )
);

CREATE TABLE "ApiRequestLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "apiVersion" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "clientIp" TEXT,
    "userPublicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegacyIdMapping_source_entityType_legacyId_key"
ON "LegacyIdMapping"("source", "entityType", "legacyId");

CREATE UNIQUE INDEX "LegacyIdMapping_source_entityType_publicId_key"
ON "LegacyIdMapping"("source", "entityType", "publicId");

CREATE INDEX "LegacyIdMapping_publicId_idx" ON "LegacyIdMapping"("publicId");
CREATE INDEX "LegacyIdMapping_entityType_migratedAt_idx" ON "LegacyIdMapping"("entityType", "migratedAt");

CREATE UNIQUE INDEX "ApiRequestLog_requestId_key" ON "ApiRequestLog"("requestId");
CREATE INDEX "ApiRequestLog_apiVersion_createdAt_idx" ON "ApiRequestLog"("apiVersion", "createdAt");
CREATE INDEX "ApiRequestLog_path_createdAt_idx" ON "ApiRequestLog"("path", "createdAt");
CREATE INDEX "ApiRequestLog_userPublicId_createdAt_idx" ON "ApiRequestLog"("userPublicId", "createdAt");

ALTER TABLE "LegacyIdMapping"
ADD CONSTRAINT "LegacyIdMapping_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LegacyIdMapping"
ADD CONSTRAINT "LegacyIdMapping_audioRoomId_fkey"
FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
