CREATE TABLE "GreedyPool" (
 "gameId" TEXT PRIMARY KEY, "balance" BIGINT NOT NULL DEFAULT 0,
 "progress" BIGINT NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "GreedyRound" (
 "id" TEXT PRIMARY KEY, "gameId" TEXT NOT NULL, "dayId" TEXT NOT NULL,
 "slot" INTEGER NOT NULL, "outcome" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GreedyRound_dayId_slot_key" ON "GreedyRound"("dayId", "slot");
CREATE INDEX "GreedyRound_gameId_createdAt_idx" ON "GreedyRound"("gameId", "createdAt");
CREATE INDEX "SharedGameEntry_userId_createdAt_idx" ON "SharedGameEntry"("userId", "createdAt");
