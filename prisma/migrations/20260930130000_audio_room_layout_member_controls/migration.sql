ALTER TABLE "AudioRoom" ADD COLUMN "seatLayout" JSONB;
ALTER TABLE "AudioRoomMember" ADD COLUMN "isDeafened" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AudioRoomMember" ADD COLUMN "deafenedUntil" TIMESTAMP(3);
ALTER TABLE "AudioRoomSeat" ADD COLUMN "forceMutedUntil" TIMESTAMP(3);

CREATE INDEX "AudioRoomMember_deafenedUntil_idx" ON "AudioRoomMember"("deafenedUntil");
CREATE INDEX "AudioRoomSeat_forceMutedUntil_idx" ON "AudioRoomSeat"("forceMutedUntil");
