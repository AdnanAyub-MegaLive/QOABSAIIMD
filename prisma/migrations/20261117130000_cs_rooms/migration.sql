CREATE TABLE "CsRoomSeat" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "occupantUserId" TEXT,
    "occupiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CsRoomSeat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CsRoomSeat_occupantUserId_key" ON "CsRoomSeat"("occupantUserId");
CREATE UNIQUE INDEX "CsRoomSeat_country_seatIndex_key" ON "CsRoomSeat"("country", "seatIndex");
CREATE TABLE "CsRoomPresence" (
    "userId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CsRoomPresence_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX "CsRoomPresence_country_lastSeenAt_idx" ON "CsRoomPresence"("country", "lastSeenAt");
