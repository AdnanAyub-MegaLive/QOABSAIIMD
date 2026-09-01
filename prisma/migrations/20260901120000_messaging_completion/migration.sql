ALTER TABLE "Conversation"
ADD COLUMN "createdById" TEXT;

ALTER TABLE "ConversationParticipant"
ADD COLUMN "role" TEXT NOT NULL DEFAULT 'MEMBER';

ALTER TABLE "Message"
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT;

CREATE INDEX "Conversation_createdById_idx" ON "Conversation"("createdById");
CREATE INDEX "Message_conversationId_deletedAt_idx" ON "Message"("conversationId", "deletedAt");

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId", "blockedId")
);

CREATE INDEX "UserBlock_blockedId_createdAt_idx" ON "UserBlock"("blockedId", "createdAt");

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_blockerId_fkey"
FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_blockedId_fkey"
FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ANDROID_FCM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX "PushDevice_userId_active_idx" ON "PushDevice"("userId", "active");

ALTER TABLE "PushDevice"
ADD CONSTRAINT "PushDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushNotification" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'FCM',
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushNotification_publicId_key" ON "PushNotification"("publicId");
CREATE INDEX "PushNotification_userId_status_createdAt_idx" ON "PushNotification"("userId", "status", "createdAt");
CREATE INDEX "PushNotification_status_createdAt_idx" ON "PushNotification"("status", "createdAt");

ALTER TABLE "PushNotification"
ADD CONSTRAINT "PushNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
