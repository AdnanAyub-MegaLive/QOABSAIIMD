CREATE TYPE "ApplicationRole" AS ENUM (
  'LISTENER', 'SENDER', 'CREATOR', 'HOST', 'MODERATOR', 'OFFICIAL',
  'BD', 'ADMIN', 'JUNIOR_ADMIN', 'SENIOR_ADMIN', 'SUPER_ADMIN', 'COUNTRY_HEAD'
);

ALTER TABLE "User"
ADD COLUMN "appRoles" "ApplicationRole"[] NOT NULL
DEFAULT ARRAY['LISTENER']::"ApplicationRole"[];

UPDATE "User"
SET "appRoles" = ARRAY[("role"::text)::"ApplicationRole"];

UPDATE "User"
SET "appRoles" = array_append("appRoles", 'OFFICIAL'::"ApplicationRole")
WHERE "isOfficial" = true;
