export const occupiedSpecialId = now => ({ status: { in: ["ACTIVE", "OWNED", "CLAIMED"] }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
export const activeSpecialIdWhere = now => ({ ...occupiedSpecialId(now), status: "ACTIVE", startsAt: { lte: now } });
const include = { definition: true, prettyIdGrant: true };
const orderBy = [{ expiresAt: { sort: "desc", nulls: "first" } }, { id: "asc" }];
const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };

export function specialIdItem(row) {
  return { assignmentId: row.id, specialId: row.specialId, type: row.definition?.category ?? "LEGACY", source: row.source, status: row.status,
    startsAt: row.startsAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null,
    durationMinutes: row.prettyIdGrant?.durationMinutes ?? (row.expiresAt ? Math.max(1, Math.round((row.expiresAt - row.startsAt) / 60000)) : null) };
}
export async function publishSpecialIdentity(userId, publicId, row) {
  try {
    for (const key of globalThis.chatPerksCache?.keys() ?? []) if (key.startsWith(`${userId}:`)) globalThis.chatPerksCache.delete(key);
    const data = { publicId, normalId: publicId, effectiveId: row?.specialId ?? publicId, specialId: row?.specialId ?? null, specialIdExpiresAt: row?.expiresAt?.toISOString() ?? null };
    globalThis.portalIo?.to(`user:${publicId}`).emit("profile:updated", { success: true, data });
    if (row?.expiresAt) await globalThis.portalScheduleSpecialIdExpiry?.(row.id, row.expiresAt);
  } catch (error) { console.error("Special ID post-commit delivery failed", error); }
}
export async function lockSpecialIdUser(tx, userId) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030140)::text AS locked`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
}
export async function retainActiveSpecialIds(tx, userId, now, exceptId) {
  await tx.specialIdAssignment.updateMany({ where: { userId, status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  await tx.specialIdAssignment.updateMany({ where: { userId, ...occupiedSpecialId(now), status: "ACTIVE", ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { status: "OWNED" } });
}
async function unavailable(tx, row, now) {
  return tx.specialIdAssignment.findFirst({ where: { id: { not: row.id }, ...occupiedSpecialId(now), AND: [{ OR: [
    { specialId: { equals: row.specialId, mode: "insensitive" } }, ...(row.definitionId ? [{ definitionId: row.definitionId }] : []),
  ] }] } });
}
async function activate(tx, row, now) {
  const duration = row.prettyIdGrant?.durationMinutes ?? row.definition?.defaultDurationMinutes;
  // Only an unactivated CLAIMED entitlement starts its timer here. Owned timers never reset.
  const startTimer = row.status === "CLAIMED" && !row.expiresAt && duration;
  return tx.specialIdAssignment.update({ where: { id: row.id }, data: { status: "ACTIVE", ...(startTimer ? { startsAt: now, expiresAt: new Date(+now + duration * 60000) } : {}) }, include });
}
// Caller holds the global allocation lock and this user's row lock.
export async function promoteSpecialId(tx, userId, now = new Date()) {
  const expired = await tx.specialIdAssignment.updateMany({ where: { userId, status: { in: ["ACTIVE", "OWNED", "CLAIMED"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  const revoked = await tx.specialIdAssignment.updateMany({ where: { userId, status: "ACTIVE", revokedAt: { not: null } }, data: { status: "REVOKED" } });
  let row = await tx.specialIdAssignment.findFirst({ where: { userId, ...activeSpecialIdWhere(now) }, include, orderBy });
  if (row) return { row, changed: false, expired: expired.count };
  const candidates = await tx.specialIdAssignment.findMany({ where: { userId, ...occupiedSpecialId(now), status: { in: ["OWNED", "CLAIMED"] }, startsAt: { lte: now } }, include, orderBy });
  for (const candidate of candidates) {
    if (await unavailable(tx, candidate, now)) continue;
    row = await activate(tx, candidate, now);
    return { row, changed: true, expired: expired.count };
  }
  return { row: null, changed: expired.count > 0 || revoked.count > 0, expired: expired.count };
}
export async function reconcileUserSpecialIds(db, userId) {
  const result = await db.$transaction(async tx => {
    await lockSpecialIdUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { publicId: true } });
    if (!user) return null;
    return { user, ...await promoteSpecialId(tx, userId) };
  });
  if (result?.changed) await publishSpecialIdentity(userId, result.user.publicId, result.row);
  return result;
}
export async function selectUserSpecialId(db, userId, assignmentId) {
  const result = await db.$transaction(async tx => {
    await lockSpecialIdUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || user.status !== "ACTIVE") fail("SESSION_REVOKED", "Account unavailable.", 401);
    const row = await tx.specialIdAssignment.findUnique({ where: { id: assignmentId }, include }), now = new Date();
    if (!row || row.userId !== userId) fail("SPECIAL_ID_NOT_OWNED", "This Special ID does not belong to you.", 403);
    if (row.status === "EXPIRED" || (row.expiresAt && row.expiresAt <= now)) fail("SPECIAL_ID_EXPIRED", "This Special ID has expired.");
    if (row.revokedAt || !["ACTIVE", "OWNED", "CLAIMED"].includes(row.status) || row.startsAt > now || await unavailable(tx, row, now)) fail("SPECIAL_ID_UNAVAILABLE", "This Special ID is unavailable.");
    await retainActiveSpecialIds(tx, userId, now, row.id);
    return { user, row: await activate(tx, row, now) };
  }, { isolationLevel: "ReadCommitted" });
  await publishSpecialIdentity(userId, result.user.publicId, result.row);
  return specialIdItem(result.row);
}
export async function listUserSpecialIds(db, userId) {
  await reconcileUserSpecialIds(db, userId);
  const rows = await db.specialIdAssignment.findMany({ where: { userId, ...occupiedSpecialId(new Date()) }, include, orderBy });
  rows.sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE"));
  return rows.map(specialIdItem);
}
