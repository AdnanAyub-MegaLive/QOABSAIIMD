import { randomUUID } from "node:crypto";

const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };
export const portalRoomActions = new Set(["FORCE_MUTE", "ALLOW_MIC", "SEAT_KICK", "KICK", "BAN", "GRANT_ADMIN", "REVOKE_ADMIN"]);

export async function applyPortalRoomControl(db, admin, input) {
  const { action, roomId, publicId } = input;
  if (!portalRoomActions.has(action)) fail("VALIDATION_ERROR", "Choose a supported room action.", 422);
  if (typeof roomId !== "string" || typeof publicId !== "string" || !roomId || !publicId)
    fail("VALIDATION_ERROR", "Choose a room and a user.", 422);
  const reason = String(input.reason ?? "").trim();
  if (!reason || reason.length > 300) fail("VALIDATION_ERROR", "Enter a reason of 1–300 characters.", 422);
  const minutes = action === "BAN" ? Number(input.durationMinutes) : null;
  if (action === "BAN" && (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 525600))
    fail("VALIDATION_ERROR", "Ban duration must be 0 (permanent) to 525600 minutes.", 422);
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const room = await tx.audioRoom.findUnique({ where: { roomId } });
        if (!room) fail("ROOM_NOT_FOUND", "Room not found.", 404);
        const target = await tx.user.findUnique({ where: { publicId } });
        if (!target) fail("USER_NOT_FOUND", "User not found.", 404);
        if (target.id === room.ownerId) fail("ROOM_OWNER_PROTECTED", "The room owner's role and membership cannot be removed here.");
        if (action === "GRANT_ADMIN") {
          if (target.deletedAt || target.status !== "ACTIVE") fail("USER_UNAVAILABLE", "Choose an active user.");
          const ban = await tx.audioRoomBan.findFirst({ where: { audioRoomId: room.id, userId: target.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
          if (ban) fail("ROOM_BANNED", "Unban this user before assigning an admin role.");
          const grant = { role: "ADMIN", grantedById: null, adminGrantorId: admin.id, adminGrantorName: admin.name, grantedAt: new Date() };
          await tx.audioRoomRole.upsert({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: target.id } }, create: { audioRoomId: room.id, userId: target.id, ...grant }, update: grant });
        } else if (action === "REVOKE_ADMIN") {
          await tx.audioRoomRole.deleteMany({ where: { audioRoomId: room.id, userId: target.id } });
        } else {
          if (["FORCE_MUTE", "ALLOW_MIC", "SEAT_KICK"].includes(action)) {
            if (!input.seatId) fail("VALIDATION_ERROR", "Choose the occupied seat.", 422);
            const changed = await tx.audioRoomSeat.updateMany({
              where: { audioRoomId: room.id, seatId: input.seatId, occupantUserId: target.id },
              data: action === "SEAT_KICK"
                ? { occupantUserId: null, occupiedAt: null, isMuted: true, isForceMuted: false, forceMutedUntil: null, isSpeaking: false }
                : { isMuted: true, isForceMuted: action === "FORCE_MUTE", forceMutedUntil: null, isSpeaking: false },
            });
            if (!changed.count) fail("SEAT_CHANGED", "The seat occupant changed. Refresh and try again.");
          } else {
            await tx.audioRoomMember.updateMany({ where: { audioRoomId: room.id, userId: target.id }, data: { socketCount: 0, lastSeenAt: new Date(), isDeafened: false, deafenedUntil: null } });
            await tx.audioRoomSeat.updateMany({ where: { audioRoomId: room.id, occupantUserId: target.id }, data: { occupantUserId: null, occupiedAt: null, isMuted: true, isForceMuted: false, forceMutedUntil: null, isSpeaking: false } });
          }
        }
        const expiresAt = action === "BAN" && minutes > 0 ? new Date(Date.now() + minutes * 60000) : null;
        if (action === "BAN") {
          await tx.audioRoomBan.updateMany({ where: { audioRoomId: room.id, userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
          await tx.audioRoomBan.create({ data: { publicId: `RBAN-${randomUUID()}`, audioRoomId: room.id, userId: target.id, adminActorId: admin.id, adminActorName: admin.name, reason, expiresAt } });
        }
        const logAction = ({ BAN: "ROOM_BANNED", GRANT_ADMIN: "ROLE_GRANTED", REVOKE_ADMIN: "ROLE_REVOKED" })[action] ?? action;
        await tx.audioRoomModerationLog.create({ data: { id: `MOD-${randomUUID()}`, audioRoomId: room.id, targetId: target.id, adminActorId: admin.id, adminActorName: admin.name, action: logAction, reason, durationMinutes: minutes, expiresAt } });
        await tx.auditLog.create({ data: { adminId: admin.id, action: `ROOM_${action}`, category: "USER_MANAGEMENT", entityType: "AudioRoom", entityId: roomId, description: `${admin.name}: ${action} ${publicId}. ${reason}` } });
        const updated = await tx.audioRoom.update({ where: { id: room.id }, data: { revision: { increment: 1 }, ...(!action.endsWith("ADMIN") ? { seatRevision: { increment: 1 } } : {}) } });
        return { room: updated, target: { publicId: target.publicId }, action, reason, expiresAt };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error.code !== "P2034" || attempt >= 2) throw error;
    }
  }
}
