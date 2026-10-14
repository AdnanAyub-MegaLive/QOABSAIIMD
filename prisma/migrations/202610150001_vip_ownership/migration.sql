ALTER TABLE "VipTier" ADD COLUMN "coinPrice" BIGINT;
CREATE TABLE "VipOwnership" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tierId" TEXT NOT NULL REFERENCES "VipTier"("id") ON DELETE RESTRICT,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  PRIMARY KEY ("userId", "tierId")
);
CREATE INDEX "VipOwnership_expiresAt_idx" ON "VipOwnership"("expiresAt");
INSERT INTO "VipOwnership" ("userId","tierId","startsAt","expiresAt","revokedAt")
SELECT "userId","tierId","startsAt","expiresAt","revokedAt" FROM "VipMembership";
CREATE TABLE "VipPurchase" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "requestKey" TEXT NOT NULL,
  "tierId" TEXT NOT NULL REFERENCES "VipTier"("id") ON DELETE RESTRICT,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "VipPurchase_userId_requestKey_key" ON "VipPurchase"("userId","requestKey");
