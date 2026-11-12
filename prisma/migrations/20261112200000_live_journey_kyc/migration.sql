ALTER TABLE "VideoLiveSession" ADD COLUMN "announcement" TEXT,
 ADD COLUMN "category" TEXT NOT NULL DEFAULT 'CHAT',
 ADD COLUMN "privacyMode" TEXT NOT NULL DEFAULT 'PUBLIC',
 ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'SOLO',
 ADD COLUMN "rtcClosedAt" TIMESTAMP(3);
UPDATE "VideoLiveSession" SET "rtcClosedAt" = COALESCE("endedAt", CURRENT_TIMESTAMP) WHERE "status" = 'ENDED';
ALTER TABLE "VideoLivePkSession" ADD COLUMN "mode" TEXT NOT NULL DEFAULT '1V1';
CREATE TABLE "VideoLiveInvite" ("sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("sessionId", "userId"), FOREIGN KEY ("sessionId") REFERENCES "VideoLiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "VideoLivePkQueue" ("sessionId" TEXT PRIMARY KEY, "mode" TEXT NOT NULL DEFAULT '1V1', "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL, FOREIGN KEY ("sessionId") REFERENCES "VideoLiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "VideoLiveAlertCooldown" ("hostId" TEXT PRIMARY KEY, "sentAt" TIMESTAMP(3) NOT NULL);
ALTER TABLE "TalentVerification" ALTER COLUMN "talentId" DROP NOT NULL;
ALTER TABLE "TalentVerification" ADD COLUMN "userId" TEXT;
ALTER TABLE "TalentVerification" ADD CONSTRAINT "TalentVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "TalentVerification_userId_submittedAt_idx" ON "TalentVerification"("userId", "submittedAt");
CREATE TABLE "KycImage" ("id" TEXT PRIMARY KEY, "data" BYTEA NOT NULL, "mimeType" TEXT NOT NULL DEFAULT 'image/webp', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
