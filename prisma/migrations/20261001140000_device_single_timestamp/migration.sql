-- Preserve the newest recorded activity before removing the redundant column.
UPDATE "Device" SET "lastLoginAt" = GREATEST("lastLoginAt", "lastActiveAt")
WHERE "lastActiveAt" IS NOT NULL;
ALTER TABLE "Device" DROP COLUMN "lastActiveAt";
