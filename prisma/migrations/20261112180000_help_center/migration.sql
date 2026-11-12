CREATE TABLE "HelpEntry" (
  "id" TEXT PRIMARY KEY, "type" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "icon" TEXT, "iconUrl" TEXT, "title" TEXT NOT NULL, "summary" TEXT, "body" TEXT, "sections" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0, "published" BOOLEAN NOT NULL DEFAULT true,
  "language" TEXT NOT NULL DEFAULT 'en', "updatedAt" TIMESTAMP(3) NOT NULL, "updatedById" TEXT
);
CREATE UNIQUE INDEX "HelpEntry_slug_language_key" ON "HelpEntry"("slug", "language");
CREATE INDEX "HelpEntry_type_published_sortOrder_idx" ON "HelpEntry"("type", "published", "sortOrder");
CREATE TABLE "HelpSettings" (
  "id" TEXT PRIMARY KEY DEFAULT 'GLOBAL', "supportEmail" TEXT NOT NULL DEFAULT 'support@megalive.live',
  "termsUrl" TEXT NOT NULL DEFAULT 'https://megachat.live/terms', "privacyUrl" TEXT NOT NULL DEFAULT 'https://megachat.live/privacy-policy',
  "liveChatEnabled" BOOLEAN NOT NULL DEFAULT true, "liveChatHours" TEXT, "seededAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL, "updatedById" TEXT
);
CREATE TABLE "HelpIcon" (
  "id" TEXT PRIMARY KEY, "data" BYTEA NOT NULL, "mimeType" TEXT NOT NULL DEFAULT 'image/webp', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
