ALTER TABLE "CpLevel" ADD COLUMN "maintenanceMinCoins" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ProfileRelationship" ADD COLUMN "maintenanceCoins" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "maintenanceDueAt" TIMESTAMP(3);
UPDATE "ProfileRelationship" SET "maintenanceDueAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '30 days'
WHERE "type" = 'CP' AND "status" = 'ACTIVE';
CREATE INDEX "ProfileRelationship_status_maintenanceDueAt_idx" ON "ProfileRelationship"("status", "maintenanceDueAt");
