CREATE TABLE "AudioRoomSeat" (
    "id" TEXT NOT NULL,
    "audioRoomId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "occupantUserId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "isMuted" BOOLEAN NOT NULL DEFAULT true,
    "isSpeaking" BOOLEAN NOT NULL DEFAULT false,
    "occupiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioRoomSeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AudioRoomSeat_audioRoomId_seatId_key"
ON "AudioRoomSeat"("audioRoomId", "seatId");

CREATE UNIQUE INDEX "AudioRoomSeat_audioRoomId_occupantUserId_key"
ON "AudioRoomSeat"("audioRoomId", "occupantUserId");

CREATE INDEX "AudioRoomSeat_audioRoomId_updatedAt_idx"
ON "AudioRoomSeat"("audioRoomId", "updatedAt");

CREATE INDEX "AudioRoomSeat_occupantUserId_idx"
ON "AudioRoomSeat"("occupantUserId");

ALTER TABLE "AudioRoomSeat"
ADD CONSTRAINT "AudioRoomSeat_audioRoomId_fkey"
FOREIGN KEY ("audioRoomId") REFERENCES "AudioRoom"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AudioRoomSeat"
ADD CONSTRAINT "AudioRoomSeat_occupantUserId_fkey"
FOREIGN KEY ("occupantUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
