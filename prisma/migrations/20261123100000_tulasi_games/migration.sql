-- CreateTable
CREATE TABLE "TulasiGame" (
    "id" TEXT NOT NULL,
    "tulasiId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gameIdentification" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "banner" TEXT,
    "gameDomain" TEXT,
    "providerStatus" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "expirationDate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TulasiGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TulasiSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "roomId" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TulasiSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TulasiGame_tulasiId_key" ON "TulasiGame"("tulasiId");

-- CreateIndex
CREATE INDEX "TulasiGame_enabled_sortOrder_idx" ON "TulasiGame"("enabled", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TulasiSession_tokenHash_key" ON "TulasiSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TulasiSession_userId_idx" ON "TulasiSession"("userId");

-- CreateIndex
CREATE INDEX "TulasiSession_expiresAt_idx" ON "TulasiSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "TulasiSession" ADD CONSTRAINT "TulasiSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

