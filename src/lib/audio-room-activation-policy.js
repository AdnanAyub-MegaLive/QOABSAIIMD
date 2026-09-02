// MegaLive product policy: listeners may join an IDLE or LIVE room. A
// successful join follows the existing server flow and promotes the room to LIVE.
export function listenerRoomJoinError(room) {
  if (!room || !["LIVE", "IDLE"].includes(room.status)) {
    return { code: "ROOM_UNAVAILABLE" };
  }
  return null;
}
