// MegaLive product policy: an IDLE room keeps its public ID, but it is not a
// listener-joinable live session. Changing this rule requires product approval.
export function listenerRoomJoinError(room) {
  if (!room || room.status !== "LIVE") {
    if (room?.status === "IDLE") {
      return {
        code: "ROOM_IDLE",
        message: "This room is not live. Its owner must start it before anyone can join.",
      };
    }
    return { code: "ROOM_UNAVAILABLE" };
  }

  return null;
}
