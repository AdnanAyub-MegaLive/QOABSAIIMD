CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "TeamInvitation" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "supervisorUserId" TEXT NOT NULL,
  "memberUserId" TEXT NOT NULL,
  "role" "ApplicationRole" NOT NULL,
  "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamInvitation_publicId_key" ON "TeamInvitation"("publicId");
CREATE INDEX "TeamInvitation_memberUserId_status_idx" ON "TeamInvitation"("memberUserId", "status");
CREATE INDEX "TeamInvitation_supervisorUserId_status_idx" ON "TeamInvitation"("supervisorUserId", "status");
CREATE UNIQUE INDEX "TeamInvitation_one_pending_per_member" ON "TeamInvitation"("memberUserId") WHERE "status" = 'PENDING';

ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_supervisorUserId_fkey" FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
