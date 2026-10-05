ALTER TABLE "VideoLiveSession" ADD COLUMN "hostLastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'LUCKY_GIFT_REWARD';
UPDATE "VideoLiveSession" SET "hostLastSeenAt" = "startedAt";
CREATE TABLE "VideoLiveCover" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "VideoLiveCover_userId_idx" ON "VideoLiveCover"("userId");
DROP INDEX "VideoLiveGuestRequest_sessionId_userId_status_key";
CREATE INDEX "VideoLiveGuestRequest_sessionId_userId_status_idx" ON "VideoLiveGuestRequest"("sessionId", "userId", "status");
