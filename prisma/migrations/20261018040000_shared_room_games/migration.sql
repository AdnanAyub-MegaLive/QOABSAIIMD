CREATE TABLE "SharedGameDay"("id" TEXT PRIMARY KEY,"gameId" TEXT NOT NULL,"day" TIMESTAMP(3) NOT NULL,"settings" JSONB NOT NULL,"seed" TEXT NOT NULL,"durationMs" INTEGER NOT NULL);
CREATE UNIQUE INDEX "SharedGameDay_gameId_day_key" ON "SharedGameDay"("gameId","day");
CREATE TABLE "SharedGameEntry"("id" TEXT PRIMARY KEY,"dayId" TEXT NOT NULL REFERENCES "SharedGameDay"("id") ON DELETE RESTRICT,"roomId" TEXT NOT NULL,"slot" INTEGER NOT NULL,"userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,"amount" BIGINT NOT NULL CHECK ("amount">0),"input" JSONB NOT NULL,"requestHash" TEXT NOT NULL,"answer" JSONB,"result" JSONB,"status" TEXT NOT NULL DEFAULT 'PENDING',"resolveAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "SharedGameEntry_dayId_roomId_slot_userId_key" ON "SharedGameEntry"("dayId","roomId","slot","userId");
CREATE INDEX "SharedGameEntry_status_resolveAt_idx" ON "SharedGameEntry"("status","resolveAt");
