export function roomGuardError(code) { return Object.assign(new Error(code), { code }); }
export async function assertRoomModerationTarget(db, room, actorId, targetId) {
  if (actorId === room.ownerId) return;
  if (targetId === room.ownerId || await db.audioRoomRole.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: targetId } } })) throw roomGuardError("ROOM_PERMISSION_DENIED");
}
export async function assertRoomModeratorPresent(db, room, actorId) {
  if (actorId === room.ownerId) return;
  const member = await db.audioRoomMember.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: actorId } } });
  if (!member || member.socketCount <= 0) throw roomGuardError("JOIN_ROOM_FIRST");
}
export const guardedRoomEvents = new Set(["seat-kick", "seat-lock", "seat-invite", "seat-force-mute", "member-force-deafen", "seat-move-member", "seats-bulk"].map(event => `audio-room:${event}`));
export async function guardRoomSocketAction(db, socket, actorId, event, input = {}) {
  if (!guardedRoomEvents.has(event)) return;
  const room = await db.audioRoom.findUnique({ where: { roomId: String(input?.roomId ?? "") } });
  if (!room) throw roomGuardError("ROOM_UNAVAILABLE");
  if (room.ownerId !== actorId && !await db.audioRoomRole.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: actorId } } })) throw roomGuardError("ROOM_PERMISSION_DENIED");
  if (!socket.rooms.has(`audio-room:${room.roomId}`)) throw roomGuardError("JOIN_ROOM_FIRST");
  if (event === "audio-room:seat-kick") {
    const seat = await db.audioRoomSeat.findUnique({ where: { audioRoomId_seatId: { audioRoomId: room.id, seatId: String(input.seatId ?? "") } } });
    if (seat?.occupantUserId) await assertRoomModerationTarget(db, room, actorId, seat.occupantUserId);
  } else if (["audio-room:seat-force-mute", "audio-room:member-force-deafen", "audio-room:seat-move-member"].includes(event)) {
    const target = await db.user.findUnique({ where: { publicId: String(input.userId ?? "") }, select: { id: true } });
    if (target) await assertRoomModerationTarget(db, room, actorId, target.id);
  } else if (event === "audio-room:seats-bulk" && String(input.action).toUpperCase() === "CLEAR_ALL" && actorId !== room.ownerId) {
    const seats = await db.audioRoomSeat.findMany({ where: { audioRoomId: room.id, occupantUserId: { not: null } }, select: { occupantUserId: true } });
    for (const seat of seats) await assertRoomModerationTarget(db, room, actorId, seat.occupantUserId);
  }
}
