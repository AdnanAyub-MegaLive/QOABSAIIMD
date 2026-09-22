-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletTransactionType" ADD VALUE 'GAME_WAGER';
ALTER TYPE "WalletTransactionType" ADD VALUE 'GAME_PAYOUT';

-- CreateTable
CREATE TABLE "GameDefinition" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSettingsAudit" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSettingsAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePlayerSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "roomId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameRound_createdAt_id_idx" ON "GameRound"("createdAt", "id");

-- CreateIndex
CREATE INDEX "GameRound_userId_createdAt_idx" ON "GameRound"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GameSettingsAudit_createdAt_id_idx" ON "GameSettingsAudit"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayerSession_tokenHash_key" ON "GamePlayerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "GamePlayerSession_expiresAt_idx" ON "GamePlayerSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRound" ADD CONSTRAINT "GameRound_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerSession" ADD CONSTRAINT "GamePlayerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
