ALTER TABLE "Message" ADD COLUMN "clientMessageId" TEXT,
 ADD COLUMN "requestHash" TEXT, ADD COLUMN "voiceKey" TEXT,
 ADD COLUMN "voiceDurationMs" INTEGER, ADD COLUMN "voiceMimeType" TEXT;
CREATE UNIQUE INDEX "Message_senderId_clientMessageId_key" ON "Message"("senderId", "clientMessageId");
CREATE TABLE "VoiceObject" ("key" TEXT NOT NULL PRIMARY KEY, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "VoiceObject_expiresAt_idx" ON "VoiceObject"("expiresAt");
