ALTER TABLE "User" ADD COLUMN "teamGrantedRole" "ApplicationRole";
ALTER TABLE "TeamInvitation" ADD COLUMN "grantsRole" BOOLEAN NOT NULL DEFAULT false;
