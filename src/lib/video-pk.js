import { randomUUID } from "node:crypto";
import { videoError, requireVideoAccess } from "./video-access.js";
import { emitToVideoLive } from "./realtime.js";
import { samePkCountry } from "./video-live.js";
import { resolveUserPerks } from "./user-perks.js";
import { requireNoCoHost, coHostBusy } from "./video-cohost.js";
import { requireLiveOwner } from "./video-moderation.js";
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
    if (!live || live.status !== "LIVE") throw videoError("LIVE_HOST_REQUIRED", "Only a live host can join the PK queue.");
    await requireLiveOwner(tx, live, user.id, "Only a live host can join the PK queue.");
    if (action === "LEAVE") { await tx.videoLivePkQueue.deleteMany({ where: { sessionId: live.id } }); return { status: "LEFT", mode }; }
    const now = new Date();
    await tx.videoLivePkQueue.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { session: { status: { not: "LIVE" } } }, { session: { hostLastSeenAt: { lte: new Date(+now - 90000) } } }] } });
    const existing = await pkConflict(tx, [live.id]);
    if (existing) throw videoError("PK_CONFLICT", "This live is already in PK.", 409);
    await requireNoCoHost(tx, [live.id]);
    const candidates = await tx.videoLivePkQueue.findMany({ where: { mode, sessionId: { not: live.id }, expiresAt: { gt: now } }, include: { session: { include: { host: { select: { country: true } } } } }, orderBy: { queuedAt: "asc" }, take: 100 });
    for (const candidate of candidates) {
      if (candidate.session.hostId === user.id || !samePkCountry(user.country, candidate.session.host?.country) || await pkConflict(tx, [candidate.sessionId]) || await coHostBusy(tx, [candidate.sessionId])) continue;
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
export async function pkSideSupporters(db, pk, origin, take = 3) {
  const from = pk.startedAt, to = pk.endedAt ?? pk.endsAt ?? new Date();
  const sides = [pk.leftSession, pk.rightSession];
  if (!from) return sides.map(s => ({ liveId: s.publicId, supporters: [] }));
  const grouped = await Promise.all(sides.map(s => db.giftTransaction.groupBy({ by: ["senderId"], where: { liveSessionId: s.id, recipientUserId: s.hostId, senderId: { not: s.hostId }, reversedAt: null, createdAt: { gte: from, lte: to } }, _sum: { coinValue: true }, _max: { createdAt: true }, orderBy: [{ _sum: { coinValue: "desc" } }, { _max: { createdAt: "asc" } }], take })));
  const ids = [...new Set(grouped.flat().map(g => g.senderId))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, publicId: true, name: true, profileImage: true } }) : [];
  const byId = new Map(users.map(u => [u.id, u]));
  const perks = users.length ? await resolveUserPerks(users, origin, ["FRAMES"]).catch(() => new Map()) : new Map();
  return sides.map((s, i) => ({ liveId: s.publicId, supporters: grouped[i].filter(g => g._sum?.coinValue > 0n && byId.has(g.senderId)).map(g => { const u = byId.get(g.senderId), p = perks.get(u.publicId); return { publicId: u.publicId, name: u.name, profileImage: u.profileImage ?? null, frameUrl: p?.frameUrl ?? null, frameMimeType: p?.frameMimeType ?? null, totalCoins: g._sum.coinValue.toString() }; }) }));
}
