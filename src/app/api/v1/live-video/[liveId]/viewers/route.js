import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { requireVideoAccess } from "@/lib/video-access";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { liveId } = await params;
    const live = await prisma.videoLiveSession.findUnique({ where: { publicId: decodeURIComponent(liveId) } });
    if (!live || live.status !== "LIVE") throw Object.assign(new Error("Live video is unavailable."), { code: "LIVE_NOT_FOUND" });
    await requireVideoAccess(prisma, live, user.id);
    const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")) || 100, 1), 200);
    const rows = await prisma.videoLiveViewer.findMany({
      where: { sessionId: live.id, active: true, userId: { not: live.hostId } },
      orderBy: { joinedAt: "desc" },
      take: limit,
      include: { user: { select: { id: true, publicId: true, name: true, profileImage: true } } },
    });
    const users = rows.map((row) => row.user);
    const perks = await resolveUserPerks(users, requestOrigin(request), ["FRAMES"]).catch(() => new Map());
    const viewers = users.map((u) => {
      const p = perks.get(u.publicId);
      return { publicId: u.publicId, name: u.name, profileImage: u.profileImage ?? null, frameUrl: p?.frameUrl ?? null, frameMimeType: p?.frameMimeType ?? null, level: p?.progression?.userLevel ?? p?.progression?.wealthLevel ?? null };
    });
    const total = await prisma.videoLiveViewer.count({ where: { sessionId: live.id, active: true, userId: { not: live.hostId } } });
    return mobileJson({ success: true, data: { liveId: live.publicId, total, viewers } });
  } catch (e) {
    return mobileApiError(e, "LIVE_VIEWERS_FAILED");
  }
}
