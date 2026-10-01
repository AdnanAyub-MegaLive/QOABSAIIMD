CREATE TABLE "DailyTaskDefinition" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "rewardCoins" BIGINT NOT NULL,
  "targetValue" INTEGER NOT NULL DEFAULT 1,
  "unit" TEXT NOT NULL DEFAULT 'COUNT',
  "cadence" TEXT NOT NULL DEFAULT 'DAILY',
  "categoryKey" TEXT NOT NULL,
  "categoryIcon" TEXT NOT NULL,
  "icon" TEXT,
  "iconUrl" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "topSupporter" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTaskDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyTaskInstance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "progressValue" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'PROGRESS',
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTaskInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyTaskStreak" (
  "userId" TEXT NOT NULL,
  "currentStreak" INTEGER NOT NULL DEFAULT 0,
  "lastSignInDate" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyTaskStreak_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "DailyTaskDefinition_type_key" ON "DailyTaskDefinition"("type");
CREATE INDEX "DailyTaskDefinition_active_categoryKey_sortOrder_idx" ON "DailyTaskDefinition"("active", "categoryKey", "sortOrder");
CREATE UNIQUE INDEX "DailyTaskInstance_userId_definitionId_periodStart_key" ON "DailyTaskInstance"("userId", "definitionId", "periodStart");
CREATE INDEX "DailyTaskInstance_userId_periodStart_state_idx" ON "DailyTaskInstance"("userId", "periodStart", "state");
ALTER TABLE "DailyTaskInstance" ADD CONSTRAINT "DailyTaskInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyTaskInstance" ADD CONSTRAINT "DailyTaskInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "DailyTaskDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyTaskStreak" ADD CONSTRAINT "DailyTaskStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DailyTaskDefinition" ("id","type","title","description","rewardCoins","targetValue","unit","cadence","categoryKey","categoryIcon","icon","featured","topSupporter","sortOrder","updatedAt") VALUES
('TASKDEF-SIGN-IN','SIGN_IN','Check in today','Open MegaLive and claim today''s check-in reward.',500,1,'COUNT','DAILY','Daily','calendar','checkin',false,false,10,CURRENT_TIMESTAMP),
('TASKDEF-WATCH','ROOM_WATCH','Watch 10 minutes of live','Spend ten minutes in MegaLive audio rooms.',1000,600,'SECONDS','DAILY','Daily','calendar','watch',false,false,20,CURRENT_TIMESTAMP),
('TASKDEF-GIFTS','SEND_GIFTS','Send 5 gifts','Support room participants by sending five gifts.',1500,5,'COUNT','DAILY','Social','people','gifts',false,false,30,CURRENT_TIMESTAMP),
('TASKDEF-GO-LIVE','LIVE_GO_LIVE','Go Live for 30 Minutes','Host an audio room for thirty minutes today.',5000,1800,'SECONDS','DAILY','Live','live','room',true,false,40,CURRENT_TIMESTAMP),
('TASKDEF-TOP-SUPPORTER','TOP_SUPPORTER','Become a Top Supporter','Send 50 gifts in total this week.',10000,50,'COUNT','WEEKLY','Special','star','weekly',false,true,50,CURRENT_TIMESTAMP);
