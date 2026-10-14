// Mirrors join restriction precedence without reconciling/writing expired restrictions.
export async function roomAccessCheck(db, room, userId, now = new Date()) {
  const result = { roomId: room?.roomId ?? null, code: null };
  if (!room) return { ...result, code: "ROOM_UNAVAILABLE" };
  const activeUntil = until => !until || until > now;
  let status = room.status;
  if (room.isBlocked && room.blockedUntil && room.blockedUntil <= now) status = "IDLE";
  if (status === "TERMINATED" && room.terminatedUntil && room.terminatedUntil <= now) status = "IDLE";
  if (room.privacyMode === "PAID") {
    const admission = room.ownerId === userId ? true : Boolean(await db.audioRoomAdmission.findUnique({ where: { audioRoomId_userId_roomSessionStartedAt: { audioRoomId: room.id, userId, roomSessionStartedAt: room.startedAt } } }));
    result.payment = { coins: room.paidEntryCoins?.toString() ?? "0", admitted: admission };
  }
  if (room.isBlocked && activeUntil(room.blockedUntil)) return { ...result, code: "ROOM_BLOCKED" };
  if (status === "TERMINATED") return { ...result, code: "ROOM_TERMINATED" };
  const ban = await db.audioRoomBan.findFirst({ where: { audioRoomId: room.id, userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { createdAt: "desc" } });
  if (ban) return { ...result, code: "ROOM_BANNED", ban: { reason: ban.reason, expiresAt: ban.expiresAt?.toISOString() ?? null } };
  if (!["LIVE", "IDLE"].includes(status)) return { ...result, code: "ROOM_UNAVAILABLE" };
  if (room.ownerId !== userId) {
    if (room.joiningDisabled && activeUntil(room.joiningDisabledUntil)) return { ...result, code: "ROOM_OWNER_ONLY" };
    if (room.passwordHash) return { ...result, code: "ROOM_PASSWORD_REQUIRED" };
    if (result.payment && !result.payment.admitted) return { ...result, code: "ROOM_PAYMENT_REQUIRED" };
  }
  return result;
}
