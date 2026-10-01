CREATE TABLE "AgencyJoinRequest" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgencyJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgencyJoinRequest_publicId_key" ON "AgencyJoinRequest"("publicId");
CREATE INDEX "AgencyJoinRequest_status_createdAt_idx" ON "AgencyJoinRequest"("status", "createdAt");
CREATE INDEX "AgencyJoinRequest_userId_createdAt_idx" ON "AgencyJoinRequest"("userId", "createdAt");
CREATE INDEX "AgencyJoinRequest_agencyId_createdAt_idx" ON "AgencyJoinRequest"("agencyId", "createdAt");
ALTER TABLE "AgencyJoinRequest" ADD CONSTRAINT "AgencyJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgencyJoinRequest" ADD CONSTRAINT "AgencyJoinRequest_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgencyJoinRequest" ADD CONSTRAINT "AgencyJoinRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
