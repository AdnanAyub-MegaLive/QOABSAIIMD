import { prisma } from "@/lib/prisma";
import { requirePortalAdmin } from "@/lib/portal-admin";
import { emitToVideoLive } from "@/lib/realtime";

export async function GET() {
  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  const sessions = await prisma.videoLiveSession.findMany({
    include: {
      host: { select: { publicId: true, name: true, profileImage: true } },
      guestRequests: { where: { status: { in: ["PENDING", "APPROVED"] } }, include: { user: { select: { publicId: true, name: true } } }, orderBy: { requestedAt: "asc" } },
      reports: { where: { status: "OPEN" }, include: { reporter: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" } },
      pkAsLeft: { where: { status: { in: ["PENDING", "LIVE"] } }, include: { rightSession: { select: { publicId: true, title: true } } } },
      pkAsRight: { where: { status: { in: ["PENDING", "LIVE"] } }, include: { leftSession: { select: { publicId: true, title: true } } } },
    },
    orderBy: { startedAt: "desc" }, take: 200,
  });
  return Response.json({ success: true, data: { sessions: sessions.map((row) => ({ id: row.publicId, title: row.title, status: row.status, hostAway: row.hostAway, host: row.host, viewerCount: row.viewerCount, peakViewers: row.peakViewers, likes: row.likeCount, giftIncome: row.giftIncome.toString(), revision: row.revision, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null, guests: row.guestRequests.map(g=>({id:g.id,status:g.status,slot:g.slot,user:g.user,expiresAt:g.expiresAt.toISOString()})), reports: row.reports.map(r=>({id:r.id,reason:r.reason,details:r.details,reporter:r.reporter,createdAt:r.createdAt.toISOString()})), pk: [...row.pkAsLeft.map(p=>({id:p.id,status:p.status,opponent:p.rightSession})),...row.pkAsRight.map(p=>({id:p.id,status:p.status,opponent:p.leftSession}))][0] ?? null })) } });
}

export async function PATCH(request) {
  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  const body = await request.json();
  if (body?.action !== "END") return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Unsupported live-video action." } }, { status: 422 });
  const row = await prisma.videoLiveSession.findUnique({ where: { publicId: String(body.liveId ?? "") } });
  if (!row) return Response.json({ success: false, error: { code: "LIVE_NOT_FOUND", message: "Live video not found." } }, { status: 404 });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.videoLiveSession.update({ where: { id: row.id }, data: { status: "ENDED", endedAt: new Date(), viewerCount: 0, revision: { increment: 1 } } });
    await tx.videoLiveViewer.updateMany({ where: { sessionId: row.id, active: true }, data: { active: false, socketCount: 0 } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "VIDEO_LIVE_ENDED", category: "CONTENT_MANAGEMENT", entityType: "VideoLiveSession", entityId: row.publicId, description: `${admin.name} ended video live ${row.publicId}.` } });
    return result;
  });
  emitToVideoLive(row.publicId, "live-video:ended", { success: true, data: { liveId: row.publicId, status: "ENDED", endedAt: updated.endedAt.toISOString(), revision: updated.revision } });
  return Response.json({ success: true, data: { liveId: row.publicId, status: updated.status } });
}
