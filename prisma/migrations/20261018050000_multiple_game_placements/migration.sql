-- Preserve every entry and its idempotency key; only remove the one-entry rule.
DROP INDEX IF EXISTS "SharedGameEntry_dayId_roomId_slot_userId_key";
CREATE INDEX IF NOT EXISTS "SharedGameEntry_dayId_roomId_slot_userId_idx" ON "SharedGameEntry"("dayId", "roomId", "slot", "userId");
