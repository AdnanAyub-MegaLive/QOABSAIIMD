BEGIN;
SET LOCAL lock_timeout = '5s';
-- Retain archived tiers for membership and purchase history while freeing their levels.
CREATE UNIQUE INDEX "VipTier_live_level_key" ON "VipTier" ("level") WHERE "archivedAt" IS NULL;
ALTER TABLE "VipTier" DROP CONSTRAINT IF EXISTS "VipTier_level_key";
DROP INDEX IF EXISTS "VipTier_level_key";
COMMIT;
