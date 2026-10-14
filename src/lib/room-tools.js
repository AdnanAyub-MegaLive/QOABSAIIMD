import { createHash } from "node:crypto";
import { notifyAction } from "./action-notifications.js";
import { roomAccessCheck } from "./room-access-check.js";

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
export function normalizeRoomMix(input, previous = {}) {
  const result = { musicVolume: previous.musicVolume ?? 100, micVolume: previous.micVolume ?? 100 };
  if (input?.musicVolume === undefined && input?.micVolume === undefined) fail("VALIDATION_ERROR", "Supply musicVolume or micVolume.");
  for (const key of ["musicVolume", "micVolume"]) {
    if (input[key] === undefined) continue;
    if (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > 100) fail("VALIDATION_ERROR", "Volumes must be integers from 0 to 100.");
    result[key] = input[key];
  }
  return result;
}
export function roomMixSnapshot(state) {
  return state?.mix ?? { musicVolume: 100, micVolume: 100, revision: 0 };
}
async function transaction(db, work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: "Serializable" }); }
    catch (error) { if (!["P2034", "P2002"].includes(error?.code) || attempt === 2) throw error; }
  }
}
async function authorize(tx, socket, actorId, roomId, ownerOnly) {
  const room = await tx.audioRoom.findUnique({ where: { roomId } });
  if (!room || !["LIVE", "IDLE"].includes(room.status) || room.isBlocked) fail("ROOM_UNAVAILABLE", "This room is unavailable.");
  if (!socket.rooms.has(`audio-room:${roomId}`)) fail("JOIN_ROOM_FIRST", "Join the room first.");
  if (room.ownerId !== actorId && (ownerOnly || !await tx.audioRoomRole.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: actorId } } }))) fail("ROOM_PERMISSION_DENIED", "You cannot perform this room action.");
  return room;
}
export async function setRoomMix(db, socket, user, input = {}) {
  normalizeRoomMix(input);
  return transaction(db, async tx => {
    const room = await authorize(tx, socket, user.id, String(input.roomId ?? ""), true);
    await tx.$queryRaw`SELECT id FROM "AudioRoom" WHERE id = ${room.id} FOR UPDATE`;
    const current = await tx.audioRoomEntertainmentState.findUnique({ where: { audioRoomId: room.id } });
    const previous = roomMixSnapshot(current), values = normalizeRoomMix(input, previous);
    if (previous.musicVolume === values.musicVolume && previous.micVolume === values.micVolume) return { roomId: room.roomId, ...previous, changed: false };
    const mix = { ...values, revision: (previous.revision ?? 0) + 1, changedBy: { publicId: user.publicId }, updatedAt: new Date().toISOString() };
    await tx.audioRoomEntertainmentState.upsert({ where: { audioRoomId: room.id }, create: { audioRoomId: room.id, mix, revision: 1, updatedById: user.id }, update: { mix, revision: { increment: 1 }, updatedById: user.id } });
    return { roomId: room.roomId, ...mix, changed: true };
  });
}
export async function inviteToRoom(db, socket, user, input = {}) {
  const requestId = input?.requestId;
  if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(requestId) || typeof input.userId !== "string" || !input.userId.trim()) fail("VALIDATION_ERROR", "Supply userId and requestId (1–64 letters, digits, underscores or hyphens).");
  return transaction(db, async tx => {
    const room = await authorize(tx, socket, user.id, String(input.roomId ?? ""), false);
    const target = await tx.user.findUnique({ where: { publicId: input.userId.trim() } });
    if (!target || target.id === user.id || target.status !== "ACTIVE" || target.deletedAt) fail("ROOM_INVITATION_UNAVAILABLE", "This user cannot receive a room invitation.");
    const banned = await tx.ban.findFirst({ where: { userId: target.id, revokedAt: null, startsAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (banned) fail("ROOM_INVITATION_UNAVAILABLE", "This user cannot receive a room invitation.");
    const blocked = await tx.userBlock.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: target.id }, { blockerId: target.id, blockedId: user.id }] } });
    if (blocked) fail("ROOM_INVITATION_UNAVAILABLE", "This user cannot receive a room invitation.");
    const access = await roomAccessCheck(tx, room, target.id);
    if (access.code && !["ROOM_PASSWORD_REQUIRED", "ROOM_PAYMENT_REQUIRED"].includes(access.code)) fail("ROOM_INVITATION_UNAVAILABLE", "This user cannot enter the room.");
    const key = `room-invite:${createHash("sha256").update(JSON.stringify([user.id, room.id, requestId])).digest("hex")}`;
    const sourceKey = `${target.id}:${key}`;
    const existing = await tx.notification.findUnique({ where: { sourceKey } });
    if (existing) return { ...existing.action, invitationId: existing.publicId, duplicate: true };
    const action = { screen: "AUDIO_ROOM", roomId: room.roomId, title: room.title, userId: target.publicId, requestId, inviter: { publicId: user.publicId, name: user.name, profileImage: user.profileImage ?? null }, expiresAt: new Date(Date.now() + 300000).toISOString() };
    const row = await notifyAction(tx, { userId: target.id, key, type: "ROOM_INVITATION", title: "Room invitation", body: `${user.name} invited you to ${room.title}.`, action });
    return { ...action, invitationId: row.publicId, duplicate: false };
  });
}

export function registerRoomTools({ db, io, socket, user, isRateLimited }) {
  for (const [event, operation, limit] of [["mix-set", setRoomMix, 60], ["room-invite", inviteToRoom, 20]]) {
    socket.on(`audio-room:${event}`, async (input = {}, callback) => {
      const ack = typeof callback === "function" ? callback : () => {};
      try {
        if (isRateLimited(`room-tools:${event}:${user.id}`, { limit, windowMs: 60000 })) fail("RATE_LIMITED", "Please wait before trying again.");
        const data = await operation(db, socket, user, input);
        if (event === "mix-set" && data.changed) io.to(`audio-room:${data.roomId}`).emit("audio-room:mix-changed", { success: true, data });
        if (event === "room-invite" && !data.duplicate) io.to(`user:${data.userId}`).emit("audio-room:room-invited", { success: true, data });
        ack({ success: true, data });
      } catch (error) {
        const known = ["VALIDATION_ERROR", "ROOM_UNAVAILABLE", "JOIN_ROOM_FIRST", "ROOM_PERMISSION_DENIED", "ROOM_INVITATION_UNAVAILABLE", "RATE_LIMITED"];
        if (!known.includes(error.code)) console.error(`Room ${event} failed`, error);
        ack({ success: false, error: { code: known.includes(error.code) ? error.code : "ROOM_ACTION_FAILED", message: known.includes(error.code) ? error.message : "Unable to complete this room action." } });
      }
    });
  }
}
