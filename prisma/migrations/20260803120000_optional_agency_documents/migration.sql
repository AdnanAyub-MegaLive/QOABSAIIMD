ALTER TABLE "AgencyApplication"
  ALTER COLUMN "cnicFrontData" DROP NOT NULL,
  ALTER COLUMN "cnicFrontMime" DROP NOT NULL,
  ALTER COLUMN "cnicBackData" DROP NOT NULL,
  ALTER COLUMN "cnicBackMime" DROP NOT NULL;

CREATE INDEX "AgencyApplication_userId_bdCode_status_idx"
ON "AgencyApplication"("userId", "bdCode", "status");
