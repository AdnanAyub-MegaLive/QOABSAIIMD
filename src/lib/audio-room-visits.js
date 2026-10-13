// Called only by the authenticated socket join path after all entry checks succeed.
export async function recordAudioRoomVisit(db, userId, audioRoomId) {
  // Database time and GREATEST prevent concurrent joins from moving a visit backwards.
  await db.$executeRaw`
    INSERT INTO "AudioRoomVisit" ("userId", "audioRoomId", "lastVisitedAt")
    VALUES (${userId}, ${audioRoomId}, clock_timestamp())
    ON CONFLICT ("userId", "audioRoomId") DO UPDATE
    SET "lastVisitedAt" = GREATEST("AudioRoomVisit"."lastVisitedAt", EXCLUDED."lastVisitedAt")
  `;
}

export function visitPageOptions(params) {
  const rawLimit = params.get("limit") ?? "20";
  const fail = () => { throw Object.assign(new Error("Invalid recent-room pagination."), { code: "VALIDATION_ERROR" }); };
  if (!/^\d+$/.test(rawLimit)) fail();
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 50) fail();
  let cursor = null;
  const raw = params.get("cursor");
  if (raw) {
    try {
      if (raw.length > 512 || !/^[\w-]+$/.test(raw)) fail();
      const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      if (typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id) || typeof value.at !== "string" || new Date(value.at).toISOString() !== value.at) fail();
      cursor = { audioRoomId: value.id, lastVisitedAt: new Date(value.at) };
    } catch { fail(); }
  }
  return { limit, cursor };
}

export function visitCursor(row) {
  return Buffer.from(JSON.stringify({ id: row.audioRoomId, at: row.lastVisitedAt.toISOString() })).toString("base64url");
}

export function recentRoomWhere(userId, cursor, now = new Date()) {
  return {
    userId,
    ...(cursor ? { OR: [{ lastVisitedAt: { lt: cursor.lastVisitedAt } }, { lastVisitedAt: cursor.lastVisitedAt, audioRoomId: { lt: cursor.audioRoomId } }] } : {}),
    audioRoom: {
      status: { in: ["LIVE", "IDLE"] }, isBlocked: false,
      owner: { status: "ACTIVE", deletedAt: null },
      OR: [{ joiningDisabled: false }, { ownerId: userId }],
      roomBans: { none: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
    },
  };
}
