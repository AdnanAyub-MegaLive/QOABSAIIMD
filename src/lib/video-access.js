export const videoError = (code, message, status = 403) => Object.assign(new Error(message), { code, status });
export function videoSetup(body, partial = false) {
  const data = {};
  for (const [key, values, fallback] of [["category", ["GAME", "CHAT", "MUSIC", "OTHER"], "CHAT"], ["privacyMode", ["PUBLIC", "FOLLOWERS", "PRIVATE"], "PUBLIC"], ["mode", ["SOLO", "GROUP"], "SOLO"]]) {
    if (partial && !Object.hasOwn(body, key)) continue;
    const value = body[key] ?? fallback;
    if (!values.includes(value)) throw videoError("VALIDATION_ERROR", `Invalid ${key}.`, 422);
    data[key] = value;
  }
  if (!partial || Object.hasOwn(body, "announcement")) {
    if (body.announcement != null && (typeof body.announcement !== "string" || body.announcement.length > 300)) throw videoError("VALIDATION_ERROR", "Announcement must be at most 300 characters.", 422);
    data.announcement = body.announcement || null;
  }
  return data;
}
export function videoVisibility(userId) {
  return { OR: [{ hostId: userId }, { privacyMode: "PUBLIC" }, { privacyMode: "FOLLOWERS", host: { followers: { some: { followerId: userId } } } }, { privacyMode: "PRIVATE", invites: { some: { userId } } }] };
}
export async function requireVideoAccess(db, live, userId) {
  if (!live) throw videoError("LIVE_NOT_FOUND", "Live video not found.", 404);
  if (live.hostId === userId) return;
  const blocked = await db.userBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: live.hostId }, { blockerId: live.hostId, blockedId: userId }] } });
  const ban = await db.videoLiveBan.findFirst({ where: { sessionId: live.id, userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  if (blocked || ban) throw videoError("LIVE_BANNED", "This live video is unavailable.");
  if (live.privacyMode === "FOLLOWERS" && !await db.userFollow.findUnique({ where: { followerId_followedId: { followerId: userId, followedId: live.hostId } } })) throw videoError("LIVE_FOLLOW_REQUIRED", "Follow the host to join this live.");
  if (live.privacyMode === "PRIVATE" && !await db.videoLiveInvite.findUnique({ where: { sessionId_userId: { sessionId: live.id, userId } } })) throw videoError("LIVE_INVITE_REQUIRED", "An invitation is required to join this live.");
}
