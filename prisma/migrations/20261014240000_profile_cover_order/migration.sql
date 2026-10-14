ALTER TABLE "ProfileCover" ADD COLUMN "createdAt" TIMESTAMP(3);
UPDATE "ProfileCover" SET "createdAt" = "updatedAt";
ALTER TABLE "ProfileCover" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "ProfileCover" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
