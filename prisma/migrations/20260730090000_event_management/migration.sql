CREATE TYPE "EventUserRole" AS ENUM ('SUPER_ADMIN', 'JUNIOR_ADMIN');
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "EventUser" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "EventUserRole" NOT NULL DEFAULT 'JUNIOR_ADMIN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "tokenVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "folderName" TEXT NOT NULL,
  "entryFile" TEXT NOT NULL DEFAULT 'index.html',
  "version" INTEGER NOT NULL DEFAULT 1,
  "latestVersion" INTEGER NOT NULL DEFAULT 1,
  "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventVersion" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "folderName" TEXT NOT NULL,
  "entryFile" TEXT NOT NULL DEFAULT 'index.html',
  "fileCount" INTEGER NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventRefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UploadLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "eventId" TEXT,
  "action" TEXT NOT NULL,
  "ip" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublishLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "eventId" TEXT,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublishLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventAuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "eventId" TEXT,
  "action" TEXT NOT NULL,
  "ip" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventUser_email_key" ON "EventUser"("email");
CREATE INDEX "EventUser_role_active_idx" ON "EventUser"("role", "active");
CREATE UNIQUE INDEX "Event_publicId_key" ON "Event"("publicId");
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
CREATE INDEX "Event_status_updatedAt_idx" ON "Event"("status", "updatedAt");
CREATE INDEX "Event_createdById_createdAt_idx" ON "Event"("createdById", "createdAt");
CREATE UNIQUE INDEX "EventVersion_eventId_version_key" ON "EventVersion"("eventId", "version");
CREATE INDEX "EventVersion_eventId_createdAt_idx" ON "EventVersion"("eventId", "createdAt");
CREATE UNIQUE INDEX "EventRefreshToken_tokenHash_key" ON "EventRefreshToken"("tokenHash");
CREATE INDEX "EventRefreshToken_userId_expiresAt_idx" ON "EventRefreshToken"("userId", "expiresAt");
CREATE INDEX "UploadLog_eventId_createdAt_idx" ON "UploadLog"("eventId", "createdAt");
CREATE INDEX "UploadLog_userId_createdAt_idx" ON "UploadLog"("userId", "createdAt");
CREATE INDEX "PublishLog_eventId_createdAt_idx" ON "PublishLog"("eventId", "createdAt");
CREATE INDEX "PublishLog_userId_createdAt_idx" ON "PublishLog"("userId", "createdAt");
CREATE INDEX "EventAuditLog_createdAt_idx" ON "EventAuditLog"("createdAt");
CREATE INDEX "EventAuditLog_userId_createdAt_idx" ON "EventAuditLog"("userId", "createdAt");
CREATE INDEX "EventAuditLog_eventId_createdAt_idx" ON "EventAuditLog"("eventId", "createdAt");

ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EventUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventVersion" ADD CONSTRAINT "EventVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventVersion" ADD CONSTRAINT "EventVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "EventUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventRefreshToken" ADD CONSTRAINT "EventRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EventUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UploadLog" ADD CONSTRAINT "UploadLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EventUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UploadLog" ADD CONSTRAINT "UploadLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishLog" ADD CONSTRAINT "PublishLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EventUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishLog" ADD CONSTRAINT "PublishLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventAuditLog" ADD CONSTRAINT "EventAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EventUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventAuditLog" ADD CONSTRAINT "EventAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
