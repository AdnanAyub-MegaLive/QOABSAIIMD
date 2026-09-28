import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { emitToVideoLive } from "@/lib/realtime";

export function OPTIONS() { return mobileOptions(); }
const clean = (value, max) => String(value ?? "").trim().slice(0, max);

async function liveFor(params) {
  const { liveId } = await params;
  const live = await prisma.videoLiveSession.findUnique({ where: { publicId: decodeURIComponent(liveId) } });
  if (!live) throw new Error("LIVE_NOT_FOUND");
  return live;
}

export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request), live = await liveFor(params);
    if (live.hostId !== user.id) throw new Error("LIVE_MODERATION_FORBIDDEN");
    const [bans, reports] = await Promise.all([
      prisma.videoLiveBan.findMany({ where: { sessionId: live.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, include: { user: { select: { publicId: true, name: true, profileImage: true } }, actor: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.videoLiveReport.findMany({ where: { sessionId: live.id }, include: { reporter: { select: { publicId: true, name: true, profileImage: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return mobileJson({ success: true, data: { liveId: live.publicId, bans: bans.map((row) => ({ id: row.id, user: row.user, actor: row.actor, reason: row.reason, expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })), reports: reports.map((row) => ({ id: row.id, reporter: row.reporter, reason: row.reason, details: row.details, status: row.status, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })) } });
  } catch (error) { return mobileApiError(error, "LIVE_MODERATION_LIST_FAILED"); }
}

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request), live = await liveFor(params), body = await request.json().catch(() => ({})), action = clean(body.action, 20).toUpperCase();
    if (action === "REPORT") {
      const reason = clean(body.reason, 80), details = clean(body.details, 1000) || null;
      if (!reason) throw Object.assign(new Error("A report reason is required."), { code: "VALIDATION_ERROR" });
      const recent = await prisma.videoLiveReport.findFirst({ where: { sessionId: live.id, reporterId: user.id, status: "OPEN", createdAt: { gt: new Date(Date.now() - 3600000) } } });
      if (recent) return mobileJson({ success: true, data: { id: recent.id, status: recent.status, duplicate: true } });
      const report = await prisma.videoLiveReport.create({ data: { id: `LVR-${crypto.randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`, sessionId: live.id, reporterId: user.id, reason, details } });
      return mobileJson({ success: true, data: { id: report.id, status: report.status, duplicate: false } }, 201);
    }
    if (live.hostId !== user.id) throw new Error("LIVE_MODERATION_FORBIDDEN");
    if (action === "BAN") {
      const target = await prisma.user.findUnique({ where: { publicId: clean(body.userId, 64) }, select: { id: true, publicId: true, name: true } });
      if (!target || target.id === user.id) throw Object.assign(new Error("Select a valid viewer."), { code: "VALIDATION_ERROR" });
      const duration = body.durationSeconds == null ? null : Math.max(60, Math.min(2592000, Number(body.durationSeconds) || 0));
      const expiresAt = duration ? new Date(Date.now() + duration * 1000) : null, reason = clean(body.reason, 300) || null;
      await prisma.videoLiveBan.updateMany({ where: { sessionId: live.id, userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      const ban = await prisma.videoLiveBan.create({ data: { id: `LVB-${crypto.randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`, sessionId: live.id, userId: target.id, actorId: user.id, reason, expiresAt } });
      await prisma.videoLiveViewer.updateMany({ where: { sessionId: live.id, userId: target.id }, data: { active: false, socketCount: 0, lastSeenAt: new Date() } });
      const viewerCount = await prisma.videoLiveViewer.count({ where: { sessionId: live.id, active: true } });
      const updated = await prisma.videoLiveSession.update({ where: { id: live.id }, data: { viewerCount, revision: { increment: 1 } }, select: { revision: true } });
      const error = { code: "LIVE_BANNED", message: "You were removed from this live video.", details: { reason, expiresAt: expiresAt?.toISOString() ?? null } };
      await globalThis.portalRemoveFromVideoLive?.(target.publicId, live.publicId, error);
      emitToVideoLive(live.publicId, "live-video:viewer-left", { success: true, data: { liveId: live.publicId, viewerCount, revision: updated.revision, userId: target.publicId } });
      return mobileJson({ success: true, data: { id: ban.id, user: target, reason, expiresAt: expiresAt?.toISOString() ?? null } });
    }
    if (action === "UNBAN") {
      const where = body.banId ? { id: clean(body.banId, 64), sessionId: live.id } : { sessionId: live.id, user: { publicId: clean(body.userId, 64) }, revokedAt: null };
      const result = await prisma.videoLiveBan.updateMany({ where, data: { revokedAt: new Date() } });
      return mobileJson({ success: true, data: { revoked: result.count } });
    }
    if (action === "RESOLVE_REPORT") {
      const report = await prisma.videoLiveReport.updateMany({ where: { id: clean(body.reportId, 64), sessionId: live.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
      return mobileJson({ success: true, data: { resolved: report.count } });
    }
    throw Object.assign(new Error("Unsupported moderation action."), { code: "VALIDATION_ERROR" });
  } catch (error) { return mobileApiError(error, "LIVE_MODERATION_FAILED"); }
}
