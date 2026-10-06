ALTER TABLE "ManagementWebSession" ADD COLUMN "mobileExpiresAt" TIMESTAMP(3);
UPDATE "ManagementWebSession" SET "mobileExpiresAt" = "expiresAt";
ALTER TABLE "ManagementWebSession" ALTER COLUMN "mobileExpiresAt" SET NOT NULL;
