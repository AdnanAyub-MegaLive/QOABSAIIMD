CREATE TABLE "GamePlayAccount" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "points" BIGINT NOT NULL DEFAULT 10000 CHECK ("points" >= 0)
);
CREATE TABLE "GamePlayRound" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "requestHash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "GamePlayRound_userId_createdAt_idx" ON "GamePlayRound"("userId", "createdAt");
