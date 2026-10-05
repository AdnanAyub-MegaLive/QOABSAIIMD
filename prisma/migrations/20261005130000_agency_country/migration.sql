ALTER TABLE "Agency" ADD COLUMN "country" TEXT;
UPDATE "Agency" a SET "country" = u."country" FROM "User" u WHERE a."ownerUserId" = u."id";
