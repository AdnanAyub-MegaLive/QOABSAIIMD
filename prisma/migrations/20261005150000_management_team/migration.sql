ALTER TYPE "ApplicationRole" ADD VALUE 'MANAGER';
ALTER TABLE "User" ADD COLUMN "supervisorUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "User" ADD COLUMN "teamRole" "ApplicationRole";
ALTER TABLE "User" ADD COLUMN "countryHeadDesignation" TEXT CHECK ("countryHeadDesignation" IN ('TITLED','ACTUAL'));
ALTER TABLE "User" ADD CONSTRAINT "User_not_own_supervisor" CHECK ("supervisorUserId" IS NULL OR "supervisorUserId" <> "id");
CREATE INDEX "User_supervisorUserId_idx" ON "User"("supervisorUserId");
CREATE TABLE "RoleTeamLimit" ("supervisorRole" TEXT NOT NULL, "memberRole" TEXT NOT NULL, "max" INTEGER CHECK ("max" >= 0), PRIMARY KEY ("supervisorRole","memberRole"));
CREATE TABLE "TeamPolicy" ("id" TEXT PRIMARY KEY DEFAULT 'GLOBAL', "limitScope" TEXT NOT NULL DEFAULT 'DIRECT' CHECK ("limitScope" IN ('DIRECT','SUBTREE')), "allowAncestorRemoval" BOOLEAN NOT NULL DEFAULT false, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "TeamPolicy" ("id") VALUES ('GLOBAL');
INSERT INTO "RoleTeamLimit" VALUES
('ADMIN','BD',2),('JUNIOR_ADMIN','ADMIN',1),('JUNIOR_ADMIN','BD',4),
('SENIOR_ADMIN','JUNIOR_ADMIN',3),('SENIOR_ADMIN','ADMIN',6),('SENIOR_ADMIN','BD',12),
('SUPER_ADMIN','SENIOR_ADMIN',2),('SUPER_ADMIN','JUNIOR_ADMIN',6),('SUPER_ADMIN','ADMIN',12),('SUPER_ADMIN','BD',24),
('COUNTRY_HEAD','SUPER_ADMIN',NULL);
