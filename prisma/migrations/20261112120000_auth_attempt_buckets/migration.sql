CREATE TABLE "AuthAttemptBucket" (
  "key" TEXT PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AuthAttemptBucket_expiresAt_idx" ON "AuthAttemptBucket"("expiresAt");
