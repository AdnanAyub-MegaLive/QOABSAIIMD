CREATE INDEX IF NOT EXISTS "User_appRoles_idx" ON "User" USING GIN ("appRoles");
