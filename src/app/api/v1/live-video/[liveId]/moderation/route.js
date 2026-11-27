import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { emitToVideoLive } from "@/lib/realtime";
import { requestOrigin } from "@/lib/user-perks";
import { canActOn, dropLiveGuest, forbidden, liveAdmins, liveRole, requireLiveStaff } from "@/lib/video-moderation";

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
    const role = await requireLiveStaff(prisma, live, user.id);
    const [bans, reports, staff] = await Promise.all([
      prisma.videoLiveBan.findMany({ where: { sessionId: live.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, include: { user: { select: { publicId: true, name: true, profileImage: true } }, actor: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.videoLiveReport.findMany({ where: { sessionId: live.id }, include: { reporter: { select: { publicId: true, name: true, profileImage: true } } }, orderBy: { createdAt: "desc" }, take: 100 }).then(rows => role === "OWNER" ? rows : []),
      liveAdmins(prisma, live.id, requestOrigin(request)),
    ]);
    return mobileJson({ success: true, data: { liveId: live.publicId, bans: bans.map((row) => ({ id: row.id, user: row.user, actor: row.actor, reason: row.reason, expiresAt: row.expiresAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })), reports: reports.map((row) => ({ id: row.id, reporter: row.reporter, reason: row.reason, details: row.details, status: row.status, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null })), admins: staff.admins, adminIds: staff.adminIds, chatLocked: Boolean(live.chatLocked), seatsLocked: Boolean(live.seatsLocked) } });
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
    const role = await requireLiveStaff(prisma, live, user.id);
    const target = async () => {
      const found = await prisma.user.findUnique({ where: { publicId: clean(body.userId, 64) }, select: { id: true, publicId: true, name: true } });
      if (!found || found.id === user.id) throw Object.assign(new Error("Select a valid viewer."), { code: "VALIDATION_ERROR" });
      const targetRole = await liveRole(prisma, live, found.id);
      if (!canActOn(role, targetRole)) throw forbidden();
      return { ...found, role: targetRole };
    };
    const flag = () => {
      const value = body.locked ?? body.admin;
      if (value === true || value === "true") return true;
      if (value === false || value === "false") return false;
      throw Object.assign(new Error("A true or false value is required."), { code: "VALIDATION_ERROR" });
    };
    const leave = async (person) => {
      await prisma.videoLiveViewer.updateMany({ where: { sessionId: live.id, userId: person.id }, data: { active: false, socketCount: 0, lastSeenAt: new Date() } });
      const viewerCount = await prisma.videoLiveViewer.count({ where: { sessionId: live.id, active: true } });
      const updated = await prisma.videoLiveSession.update({ where: { id: live.id }, data: { viewerCount, revision: { increment: 1 } }, select: { revision: true } });
      await dropLiveGuest(prisma, live, person);
      return { viewerCount, revision: updated.revision };
    };
    const roles = async () => {
      const { adminIds } = await liveAdmins(prisma, live.id, requestOrigin(request));
      await emitToVideoLive(live.publicId, "live-video:roles", { success: true, data: { liveId: live.publicId, adminIds } });
      return adminIds;
    };
    const requireLive = () => { if (live.status !== "LIVE") throw new Error("LIVE_NOT_FOUND"); };
    if (action === "BAN") {
      const person = await target(), { role: targetRole, ...targetUser } = person;
      const duration = body.durationSeconds == null ? null : Math.max(60, Math.min(2592000, Number(body.durationSeconds) || 0));
      const expiresAt = duration ? new Date(Date.now() + duration * 1000) : null, reason = clean(body.reason, 300) || null;
      await prisma.videoLiveBan.updateMany({ where: { sessionId: live.id, userId: person.id, revokedAt: null }, data: { revokedAt: new Date() } });
      const ban = await prisma.videoLiveBan.create({ data: { id: `LVB-${crypto.randomUUID().replaceAll("-", "").slice(0, 14).toUpperCase()}`, sessionId: live.id, userId: person.id, actorId: user.id, reason, expiresAt } });
      if (targetRole === "ADMIN") await prisma.videoLiveAdmin.deleteMany({ where: { sessionId: live.id, userId: person.id } });
      const { viewerCount, revision } = await leave(person);
      const error = { code: "LIVE_BANNED", message: "You were removed from this live video.", details: { reason, expiresAt: expiresAt?.toISOString() ?? null } };
      await globalThis.portalRemoveFromVideoLive?.(person.publicId, live.publicId, error);
      emitToVideoLive(live.publicId, "live-video:viewer-left", { success: true, data: { liveId: live.publicId, viewerCount, revision, userId: person.publicId } });
      if (targetRole === "ADMIN") await roles();
      return mobileJson({ success: true, data: { id: ban.id, user: targetUser, reason, expiresAt: expiresAt?.toISOString() ?? null } });
    }
    if (action === "KICK") {
      requireLive();
      const person = await target(), { viewerCount, revision } = await leave(person);
      await globalThis.portalRemoveFromVideoLive?.(person.publicId, live.publicId, { code: "LIVE_KICKED", message: "You were removed from this live." }, "live-video:kicked");
      await emitToVideoLive(live.publicId, "live-video:kicked", { success: true, data: { liveId: live.publicId, userId: person.publicId } });
      await emitToVideoLive(live.publicId, "live-video:viewer-left", { success: true, data: { liveId: live.publicId, viewerCount, revision, userId: person.publicId } });
      return mobileJson({ success: true, data: { liveId: live.publicId, userId: person.publicId, kicked: true } });
    }
    if (action === "CLEAR_CHAT") {
      requireLive();
      await emitToVideoLive(live.publicId, "live-video:chat-cleared", { success: true, data: { liveId: live.publicId } });
      return mobileJson({ success: true, data: { liveId: live.publicId, cleared: true } });
    }
    if (action === "LOCK_CHAT" || action === "LOCK_SEATS") {
      requireLive();
      const locked = flag(), field = action === "LOCK_CHAT" ? "chatLocked" : "seatsLocked";
      await prisma.videoLiveSession.update({ where: { id: live.id }, data: { [field]: locked, revision: { increment: 1 } } });
      await emitToVideoLive(live.publicId, action === "LOCK_CHAT" ? "live-video:chat-lock" : "live-video:seat-lock", { success: true, data: { liveId: live.publicId, locked } });
      return mobileJson({ success: true, data: { liveId: live.publicId, [field]: locked } });
    }
    if (action === "SET_ADMIN") {
      requireLive();
      if (role !== "OWNER") throw forbidden();
      const admin = flag(), person = await target();
      if (admin) await prisma.videoLiveAdmin.upsert({ where: { sessionId_userId: { sessionId: live.id, userId: person.id } }, create: { sessionId: live.id, userId: person.id }, update: {} });
      else await prisma.videoLiveAdmin.deleteMany({ where: { sessionId: live.id, userId: person.id } });
      const adminIds = await roles();
      return mobileJson({ success: true, data: { liveId: live.publicId, userId: person.publicId, admin, adminIds } });
    }
    if (action === "MUTE_GUEST" || action === "CAMERA_OFF_GUEST") {
      requireLive();
      const person = await target();
      const guest = await prisma.videoLiveGuestRequest.findFirst({ where: { sessionId: live.id, userId: person.id, status: "APPROVED" } });
      if (!guest) throw new Error("GUEST_REQUEST_UNAVAILABLE");
      const data = { liveId: live.publicId, userId: person.publicId, mic: action === "MUTE_GUEST", camera: action === "CAMERA_OFF_GUEST" };
      await emitToVideoLive(live.publicId, "live-video:guest-muted", { success: true, data });
      return mobileJson({ success: true, data });
    }
    if (action === "UNBAN") {
      const where = body.banId ? { id: clean(body.banId, 64), sessionId: live.id } : { sessionId: live.id, user: { publicId: clean(body.userId, 64) }, revokedAt: null };
      const result = await prisma.videoLiveBan.updateMany({ where, data: { revokedAt: new Date() } });
      return mobileJson({ success: true, data: { revoked: result.count } });
    }
    if (action === "RESOLVE_REPORT") {
      if (role !== "OWNER") throw forbidden();
      const report = await prisma.videoLiveReport.updateMany({ where: { id: clean(body.reportId, 64), sessionId: live.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
      return mobileJson({ success: true, data: { resolved: report.count } });
    }
    throw Object.assign(new Error("Unsupported moderation action."), { code: "VALIDATION_ERROR" });
  } catch (error) { return mobileApiError(error, "LIVE_MODERATION_FAILED"); }
}
