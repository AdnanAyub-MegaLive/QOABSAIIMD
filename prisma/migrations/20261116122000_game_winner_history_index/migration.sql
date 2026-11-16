-- Outside a transaction: existing game writes stay available during the build.
CREATE INDEX CONCURRENTLY "SharedGameEntry_userId_dayId_roomId_slot_idx"
 ON "SharedGameEntry"("userId","dayId","roomId",slot);
