ALTER TABLE "Message" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text', ADD COLUMN "mediaId" TEXT, ADD COLUMN "media" JSONB, ADD COLUMN "gift" JSONB;
UPDATE "Message" SET "kind" = 'voice' WHERE "voiceKey" IS NOT NULL;
CREATE UNIQUE INDEX "Message_mediaId_key" ON "Message"("mediaId");
CREATE TABLE "ChatMediaObject" (
 "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL, "uploaderId" TEXT NOT NULL,
 "key" TEXT NOT NULL, "posterKey" TEXT, "kind" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
 "width" INTEGER NOT NULL, "height" INTEGER NOT NULL, "durationMs" INTEGER,
 "mediaVersion" TEXT NOT NULL, "ready" BOOLEAN NOT NULL DEFAULT false,
 "consumed" BOOLEAN NOT NULL DEFAULT false, "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChatMediaObject_key_key" ON "ChatMediaObject"("key");
CREATE INDEX "ChatMediaObject_expiresAt_idx" ON "ChatMediaObject"("expiresAt");
CREATE INDEX "ChatMediaObject_conversationId_uploaderId_idx" ON "ChatMediaObject"("conversationId", "uploaderId");
