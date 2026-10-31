CREATE TYPE "PostReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "Post" ADD COLUMN "status" "PostReviewStatus" NOT NULL DEFAULT 'APPROVED',
 ADD COLUMN "reviewReason" TEXT,
 ADD COLUMN "reviewedAt" TIMESTAMP(3),
 ADD COLUMN "reviewedByAdminId" TEXT,
 ADD COLUMN "reviewRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ALTER COLUMN "status" SET DEFAULT 'PENDING';
CREATE INDEX "Post_status_createdAt_id_idx" ON "Post"("status", "createdAt", "id");
