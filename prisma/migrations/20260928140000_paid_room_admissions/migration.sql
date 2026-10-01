ALTER TYPE "WalletTransactionType" ADD VALUE 'ROOM_ENTRY_PAID';
ALTER TYPE "WalletTransactionType" ADD VALUE 'ROOM_ENTRY_EARNED';
CREATE TABLE "AudioRoomAdmission" ("id" TEXT NOT NULL,"audioRoomId" TEXT NOT NULL,"userId" TEXT NOT NULL,"ownerId" TEXT NOT NULL,"roomSessionStartedAt" TIMESTAMP(3) NOT NULL,"coins" BIGINT NOT NULL,"admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AudioRoomAdmission_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AudioRoomAdmission_audioRoomId_userId_roomSessionStartedAt_key" ON "AudioRoomAdmission"("audioRoomId","userId","roomSessionStartedAt");
CREATE INDEX "AudioRoomAdmission_userId_admittedAt_idx" ON "AudioRoomAdmission"("userId","admittedAt");
ALTER TABLE "AudioRoomAdmission" ADD CONSTRAINT "AudioRoomAdmission_audioRoomId_fkey" FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomAdmission" ADD CONSTRAINT "AudioRoomAdmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AudioRoomAdmission" ADD CONSTRAINT "AudioRoomAdmission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
