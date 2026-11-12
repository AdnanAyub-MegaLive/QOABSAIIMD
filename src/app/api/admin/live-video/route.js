import { portalPermissionError } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { requirePortalAdmin } from "@/lib/portal-admin";
import { endVideoLive } from "@/lib/video-lifecycle";
import { sameOrigin } from "@/lib/game-control/http";

export async function GET(request) {
  const permissionDenied = await portalPermissionError("video.view");
  if (permissionDenied) return permissionDenied;

  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  const params=new URL(request.url).searchParams;
  const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get("page")))||1));
  const status=params.get("status");
  const where=["LIVE","ENDED"].includes(status)?{status}:{};
  const total=await prisma.videoLiveSession.count({where});
  const sessions = await prisma.videoLiveSession.findMany({
    where,
    include: {
      host: { select: { publicId: true, name: true, profileImage: true } },
      guestRequests: { where: { status: { in: ["PENDING", "APPROVED"] } }, include: { user: { select: { publicId: true, name: true } } }, orderBy: { requestedAt: "asc" } },
      reports: { where: { status: "OPEN" }, include: { reporter: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" } },
      pkAsLeft: { where: { status: { in: ["PENDING", "LIVE"] } }, include: { rightSession: { select: { publicId: true, title: true } } } },
      pkAsRight: { where: { status: { in: ["PENDING", "LIVE"] } }, include: { leftSession: { select: { publicId: true, title: true } } } },
    },
    orderBy: [{ startedAt: "desc" },{id:"desc"}], skip:(page-1)*50, take:50,
  });
  return Response.json({ success: true, data: { page,total,pageSize:50,sessions: sessions.map((row) => ({ id: row.publicId, title: row.title, status: row.status, hostAway: row.hostAway, host: row.host, viewerCount: row.viewerCount, peakViewers: row.peakViewers, likes: row.likeCount, giftIncome: row.giftIncome.toString(), revision: row.revision, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null, guests: row.guestRequests.map(g=>({id:g.id,status:g.status,slot:g.slot,user:g.user,expiresAt:g.expiresAt.toISOString()})), reports: row.reports.map(r=>({id:r.id,reason:r.reason,details:r.details,reporter:r.reporter,createdAt:r.createdAt.toISOString()})), pk: [...row.pkAsLeft.map(p=>({id:p.id,status:p.status,opponent:p.rightSession})),...row.pkAsRight.map(p=>({id:p.id,status:p.status,opponent:p.leftSession}))][0] ?? null })) } });
}

export async function PATCH(request) {
  const permissionDenied = await portalPermissionError("video.edit");
  if (permissionDenied) return permissionDenied;

  const admin = await requirePortalAdmin();
  if (!admin) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator access is required." } }, { status: 401 });
  const body = await request.json();
  if (body?.action !== "END") return Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Unsupported live-video action." } }, { status: 422 });
  const row = await prisma.videoLiveSession.findUnique({ where: { publicId: String(body.liveId ?? "") } });
  if (!row) return Response.json({ success: false, error: { code: "LIVE_NOT_FOUND", message: "Live video not found." } }, { status: 404 });
  try {
    sameOrigin(request);
    const updated = await endVideoLive(row, admin);
    return Response.json({ success: true, data: { liveId: row.publicId, status: updated.status } });
  } catch (error) { return Response.json({success:false,error:{message:"Unable to complete live cleanup. Retry the action."}},{status:error.status||503}); }
}
