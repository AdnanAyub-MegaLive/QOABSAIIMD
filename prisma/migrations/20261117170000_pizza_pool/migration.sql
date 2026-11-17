CREATE TABLE "PizzaPool" (
 "gameId" TEXT PRIMARY KEY, "balance" BIGINT NOT NULL DEFAULT 0,
 "progress" BIGINT NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "PizzaRound" (
 "id" TEXT PRIMARY KEY, "gameId" TEXT NOT NULL, "dayId" TEXT NOT NULL,
 "slot" INTEGER NOT NULL, "outcome" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PizzaRound_dayId_slot_key" ON "PizzaRound"("dayId", "slot");
CREATE INDEX "PizzaRound_gameId_createdAt_idx" ON "PizzaRound"("gameId", "createdAt");
