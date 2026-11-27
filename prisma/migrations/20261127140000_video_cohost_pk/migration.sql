BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE "VideoCoHostSession" ("id" TEXT NOT NULL, "ownerLiveId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'LOBBY', "mode" TEXT NOT NULL DEFAULT 'SOLO', "durationSeconds" INTEGER NOT NULL DEFAULT 300, "revision" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "startedAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "winnerTeam" TEXT, "winnerLiveId" TEXT, CONSTRAINT "VideoCoHostSession_pkey" PRIMARY KEY ("id"));
CREATE TABLE "VideoCoHostMember" ("coHostId" TEXT NOT NULL, "liveId" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'COHOST', "status" TEXT NOT NULL DEFAULT 'INVITED', "team" TEXT, "score" BIGINT NOT NULL DEFAULT 0, "invitedByLiveId" TEXT, "inviteExpiresAt" TIMESTAMP(3), "joinedAt" TIMESTAMP(3), "leftAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "VideoCoHostMember_pkey" PRIMARY KEY ("coHostId", "liveId"));
CREATE INDEX "VideoCoHostSession_ownerLiveId_status_idx" ON "VideoCoHostSession"("ownerLiveId", "status");
CREATE INDEX "VideoCoHostSession_status_endsAt_idx" ON "VideoCoHostSession"("status", "endsAt");
CREATE INDEX "VideoCoHostMember_liveId_status_idx" ON "VideoCoHostMember"("liveId", "status");
CREATE INDEX "VideoCoHostMember_status_inviteExpiresAt_idx" ON "VideoCoHostMember"("status", "inviteExpiresAt");
ALTER TABLE "VideoCoHostSession" ADD CONSTRAINT "VideoCoHostSession_ownerLiveId_fkey" FOREIGN KEY ("ownerLiveId") REFERENCES "VideoLiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoCoHostMember" ADD CONSTRAINT "VideoCoHostMember_coHostId_fkey" FOREIGN KEY ("coHostId") REFERENCES "VideoCoHostSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoCoHostMember" ADD CONSTRAINT "VideoCoHostMember_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "VideoLiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
