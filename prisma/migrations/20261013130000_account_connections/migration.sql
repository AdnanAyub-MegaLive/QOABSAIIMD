ALTER TABLE "User" ADD COLUMN "googleEmail" TEXT;
UPDATE "User" SET "googleEmail" = "email" WHERE "googleSubject" IS NOT NULL;
CREATE TABLE "AccountConnectionState" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "windowAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "challengeId" TEXT,
  "phone" TEXT,
  "provider" TEXT,
  "sessionVersion" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3)
);
