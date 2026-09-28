ALTER TABLE "AudioRoom" ADD COLUMN "announcement" TEXT,
ADD COLUMN "language" TEXT,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "privacyMode" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN "paidEntryCoins" BIGINT,
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "AudioRoomRole" ("id" TEXT NOT NULL,"audioRoomId" TEXT NOT NULL,"userId" TEXT NOT NULL,"role" TEXT NOT NULL DEFAULT 'ADMIN',"grantedById" TEXT NOT NULL,"grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AudioRoomRole_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AudioRoomBan" ("id" TEXT NOT NULL,"publicId" TEXT NOT NULL,"audioRoomId" TEXT NOT NULL,"userId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"reason" TEXT,"expiresAt" TIMESTAMP(3),"revokedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AudioRoomBan_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AudioRoomModerationLog" ("id" TEXT NOT NULL,"audioRoomId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"targetId" TEXT,"action" TEXT NOT NULL,"reason" TEXT,"durationMinutes" INTEGER,"expiresAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AudioRoomModerationLog_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AudioRoomMember" ("audioRoomId" TEXT NOT NULL,"userId" TEXT NOT NULL,"socketCount" INTEGER NOT NULL DEFAULT 0,"joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AudioRoomMember_pkey" PRIMARY KEY ("audioRoomId","userId"));
CREATE UNIQUE INDEX "AudioRoomRole_audioRoomId_userId_key" ON "AudioRoomRole"("audioRoomId","userId");
CREATE INDEX "AudioRoomRole_userId_idx" ON "AudioRoomRole"("userId");
CREATE UNIQUE INDEX "AudioRoomBan_publicId_key" ON "AudioRoomBan"("publicId");
CREATE INDEX "AudioRoomBan_audioRoomId_userId_expiresAt_idx" ON "AudioRoomBan"("audioRoomId","userId","expiresAt");
CREATE INDEX "AudioRoomBan_audioRoomId_createdAt_idx" ON "AudioRoomBan"("audioRoomId","createdAt");
CREATE INDEX "AudioRoomModerationLog_audioRoomId_createdAt_idx" ON "AudioRoomModerationLog"("audioRoomId","createdAt");
CREATE INDEX "AudioRoomMember_audioRoomId_socketCount_joinedAt_idx" ON "AudioRoomMember"("audioRoomId","socketCount","joinedAt");
ALTER TABLE "AudioRoomRole" ADD CONSTRAINT "AudioRoomRole_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomRole" ADD CONSTRAINT "AudioRoomRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomRole" ADD CONSTRAINT "AudioRoomRole_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AudioRoomBan" ADD CONSTRAINT "AudioRoomBan_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomBan" ADD CONSTRAINT "AudioRoomBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomBan" ADD CONSTRAINT "AudioRoomBan_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AudioRoomModerationLog" ADD CONSTRAINT "AudioRoomModerationLog_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomModerationLog" ADD CONSTRAINT "AudioRoomModerationLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AudioRoomModerationLog" ADD CONSTRAINT "AudioRoomModerationLog_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AudioRoomMember" ADD CONSTRAINT "AudioRoomMember_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomMember" ADD CONSTRAINT "AudioRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
