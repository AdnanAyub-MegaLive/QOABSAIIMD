ALTER TABLE "AudioRoom" ADD COLUMN "coverRevision" INTEGER NOT NULL DEFAULT 0;
UPDATE "AudioRoom" SET "coverRevision" = 1 WHERE "coverImageUrl" IS NOT NULL;
