ALTER TYPE "WalletTransactionType" ADD VALUE 'RED_ENVELOPE_SENT';
ALTER TYPE "WalletTransactionType" ADD VALUE 'RED_ENVELOPE_CLAIMED';
ALTER TYPE "WalletTransactionType" ADD VALUE 'RED_ENVELOPE_REFUND';

CREATE TYPE "RedEnvelopeStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED');

CREATE TABLE "RedEnvelope" (
  "id" TEXT NOT NULL,
  "audioRoomId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "totalCoins" BIGINT NOT NULL,
  "remainingCoins" BIGINT NOT NULL,
  "shareCount" INTEGER NOT NULL,
  "remainingShares" INTEGER NOT NULL,
  "delaySeconds" INTEGER NOT NULL,
  "claimableAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "RedEnvelopeStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RedEnvelope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RedEnvelopeClaim" (
  "id" TEXT NOT NULL,
  "envelopeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amountCoins" BIGINT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedEnvelopeClaim_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RedEnvelope_audioRoomId_status_expiresAt_idx" ON "RedEnvelope"("audioRoomId", "status", "expiresAt");
CREATE INDEX "RedEnvelope_senderId_createdAt_idx" ON "RedEnvelope"("senderId", "createdAt");
CREATE UNIQUE INDEX "RedEnvelopeClaim_envelopeId_userId_key" ON "RedEnvelopeClaim"("envelopeId", "userId");
CREATE INDEX "RedEnvelopeClaim_envelopeId_claimedAt_idx" ON "RedEnvelopeClaim"("envelopeId", "claimedAt");
CREATE INDEX "RedEnvelopeClaim_userId_claimedAt_idx" ON "RedEnvelopeClaim"("userId", "claimedAt");
ALTER TABLE "RedEnvelope" ADD CONSTRAINT "RedEnvelope_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RedEnvelope" ADD CONSTRAINT "RedEnvelope_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RedEnvelopeClaim" ADD CONSTRAINT "RedEnvelopeClaim_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "RedEnvelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RedEnvelopeClaim" ADD CONSTRAINT "RedEnvelopeClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
