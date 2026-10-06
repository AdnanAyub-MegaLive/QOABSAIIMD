ALTER TABLE "Ban" ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "Ban" ADD COLUMN "actorUserId" TEXT;
CREATE TABLE "ManagementWebSession" (
 "id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "sessionVersion" INTEGER NOT NULL, "deviceId" TEXT,
 "mobileIssuedAt" BIGINT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "kind" TEXT NOT NULL CHECK ("kind" IN ('HANDOFF','BROWSER')),
 "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ManagementWebSession_userId_expiresAt_idx" ON "ManagementWebSession"("userId","expiresAt");
