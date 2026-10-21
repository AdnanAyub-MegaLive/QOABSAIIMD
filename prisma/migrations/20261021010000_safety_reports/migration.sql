CREATE TABLE "SafetyReport" (
 "id" TEXT PRIMARY KEY, "publicId" TEXT NOT NULL UNIQUE,
 "reporterUserId" TEXT NOT NULL, "requestId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "targetInternalId" TEXT NOT NULL,
 "roomId" TEXT, "reason" TEXT NOT NULL, "details" TEXT NOT NULL DEFAULT '',
 "status" TEXT NOT NULL DEFAULT 'OPEN', "reviewNote" TEXT NOT NULL DEFAULT '',
 "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SafetyReport_reporterUserId_requestId_key" ON "SafetyReport"("reporterUserId","requestId");
CREATE INDEX "SafetyReport_status_createdAt_id_idx" ON "SafetyReport"("status","createdAt","id");
