ALTER TABLE "Agency" ADD COLUMN "bdUserId" TEXT;
ALTER TABLE "AgencyApplication" ADD COLUMN "bdUserId" TEXT, ADD COLUMN "reviewedByUserId" TEXT;
ALTER TABLE "Agency" ADD CONSTRAINT "Agency_bdUserId_fkey" FOREIGN KEY ("bdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgencyApplication" ADD CONSTRAINT "AgencyApplication_bdUserId_fkey" FOREIGN KEY ("bdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgencyApplication" ADD CONSTRAINT "AgencyApplication_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AgencyApplication_bdUserId_status_createdAt_idx" ON "AgencyApplication"("bdUserId", "status", "createdAt");
-- Link legacy BD codes only when they exactly identify an existing BD user.
UPDATE "AgencyApplication" a SET "bdUserId" = u."id" FROM "User" u
WHERE lower(a."bdCode") = lower(u."publicId") AND 'BD' = ANY(u."appRoles") AND u."deletedAt" IS NULL;
UPDATE "Agency" g SET "bdUserId" = a."bdUserId" FROM "AgencyApplication" a
WHERE a."agencyId" = g."id" AND a."bdUserId" IS NOT NULL;
