CREATE TABLE "GameTriviaHistory" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
 "seen" JSONB NOT NULL
);
CREATE TABLE "GamePlayChallenge" (
 "id" TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "payload" JSONB NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "GamePlayChallenge_userId_expiresAt_idx" ON "GamePlayChallenge"("userId","expiresAt");
