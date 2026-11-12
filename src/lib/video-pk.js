import { randomUUID } from "node:crypto";
import { videoError, requireVideoAccess } from "./video-access.js";
import { emitToVideoLive } from "./realtime.js";
export const videoPkDto = p => ({ id: p.id, mode: p.mode || "1V1", status: p.status, leftLiveId: p.leftSession.publicId, rightLiveId: p.rightSession.publicId, leftScore: p.leftScore.toString(), rightScore: p.rightScore.toString(), revision: p.revision, startedAt: p.startedAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null, endedAt: p.endedAt?.toISOString() ?? null, winnerLiveId: p.winnerLiveId });
export function videoPkMode(mode = "1V1") {
  if (mode !== "1V1") throw videoError("VALIDATION_ERROR", "Only 1V1 PK is currently available.", 422);
  return mode;
}
export async function pkConflict(tx, ids) {
  return tx.videoLivePkSession.findFirst({ where: { status: { in: ["PENDING", "LIVE"] }, OR: [{ leftSessionId: { in: ids } }, { rightSessionId: { in: ids } }] } });
}
export async function videoPkQueue(db, user, liveId, body) {
  const mode = videoPkMode(body.mode), action = String(body.action || "JOIN").toUpperCase();
  if (!["JOIN", "LEAVE"].includes(action)) throw videoError("VALIDATION_ERROR", "Use JOIN or LEAVE.", 422);
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('video-pk-matching'))::text AS locked`;
    const live = await tx.videoLiveSession.findUnique({ where: { publicId: liveId } });
    if (!live || live.hostId !== user.id || live.status !== "LIVE") throw videoError("LIVE_HOST_REQUIRED", "Only a live host can join the PK queue.");
    if (action === "LEAVE") { await tx.videoLivePkQueue.deleteMany({ where: { sessionId: live.id } }); return { status: "LEFT", mode }; }
    const now = new Date();
    await tx.videoLivePkQueue.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { session: { status: { not: "LIVE" } } }, { session: { hostLastSeenAt: { lte: new Date(+now - 90000) } } }] } });
    const existing = await pkConflict(tx, [live.id]);
    if (existing) throw videoError("PK_CONFLICT", "This live is already in PK.", 409);
    const candidates = await tx.videoLivePkQueue.findMany({ where: { mode, sessionId: { not: live.id }, expiresAt: { gt: now } }, include: { session: true }, orderBy: { queuedAt: "asc" }, take: 100 });
    for (const candidate of candidates) {
      if (candidate.session.hostId === user.id || await pkConflict(tx, [candidate.sessionId])) continue;
      try { await requireVideoAccess(tx, candidate.session, user.id); await requireVideoAccess(tx, live, candidate.session.hostId); } catch (e) { if (e.status === 403) continue; throw e; }
      const pk = await tx.videoLivePkSession.create({ data: { id: `VPK-${randomUUID()}`, mode, leftSessionId: candidate.sessionId, rightSessionId: live.id, status: "LIVE", startedAt: now, endsAt: new Date(+now + 300000) }, include: { leftSession: true, rightSession: true } });
      await tx.videoLivePkQueue.deleteMany({ where: { sessionId: { in: [live.id, candidate.sessionId] } } });
      return { status: "MATCHED", mode, pk: videoPkDto(pk) };
    }
    const expiresAt = new Date(+now + 120000);
    await tx.videoLivePkQueue.upsert({ where: { sessionId: live.id }, create: { sessionId: live.id, mode, expiresAt }, update: { expiresAt } });
    return { status: "WAITING", mode, expiresAt: expiresAt.toISOString() };
  }, { timeout: 15000 });
  if (result.pk) for (const id of [result.pk.leftLiveId, result.pk.rightLiveId]) await emitToVideoLive(id, "live-video:pk-changed", { success: true, data: result.pk });
  return result;
}
