ALTER TABLE "Conversation" ADD COLUMN "description" TEXT, ADD COLUMN "iconId" TEXT, ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE TABLE "GroupChangeRequest" (
 "id" TEXT PRIMARY KEY, "actorId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GroupChangeRequest_actorId_requestId_key" ON "GroupChangeRequest"("actorId","requestId");
CREATE TABLE "GroupIcon" (
 "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL, "key" TEXT NOT NULL,
 "mediaVersion" TEXT NOT NULL, "publishedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GroupIcon_key_key" ON "GroupIcon"("key");
CREATE INDEX "GroupIcon_expiresAt_idx" ON "GroupIcon"("expiresAt");
