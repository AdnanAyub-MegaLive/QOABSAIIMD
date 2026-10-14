CREATE TABLE "ActivityLevelRule" ("track" TEXT PRIMARY KEY,"revision" INTEGER NOT NULL DEFAULT 0,"enabled" BOOLEAN NOT NULL DEFAULT false,"rateBps" INTEGER NOT NULL DEFAULT 0,"levels" JSONB NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "ActivityLevelAward" ("id" TEXT PRIMARY KEY,"track" TEXT NOT NULL,"subjectId" TEXT NOT NULL,"sourceId" TEXT NOT NULL,"amount" BIGINT NOT NULL,"xp" BIGINT NOT NULL,"ruleRevision" INTEGER NOT NULL,"rateBps" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ActivityLevelAward_track_sourceId_key" ON "ActivityLevelAward"("track","sourceId");
CREATE INDEX "ActivityLevelAward_track_subjectId_idx" ON "ActivityLevelAward"("track","subjectId");
