import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { videoError } from "@/lib/video-access";
import { emitToUser } from "@/lib/realtime";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request, { params }) {
  try {
    const host = await requireMobileUser(request), { liveId } = await params, body = await request.json();
    const live = await prisma.videoLiveSession.findUnique({ where: { publicId: liveId } });
    if (!live || live.status !== "LIVE" || live.hostId !== host.id) throw videoError("LIVE_HOST_REQUIRED", "Only the live host can invite viewers.");
    const user = await prisma.user.findUnique({ where: { publicId: String(body.participantId || "") } });
    if (!user || user.status !== "ACTIVE" || user.deletedAt) throw videoError("USER_NOT_FOUND", "User not found.", 404);
    if (await prisma.userBlock.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: host.id }, { blockerId: host.id, blockedId: user.id }] } })) throw videoError("LIVE_BANNED", "This user cannot be invited.");
    await prisma.videoLiveInvite.upsert({ where: { sessionId_userId: { sessionId: live.id, userId: user.id } }, create: { sessionId: live.id, userId: user.id }, update: {} });
    await emitToUser(user.publicId, "live-video:invited", { liveId, host: { publicId: host.publicId, name: host.name }, title: live.title });
    return mobileJson({ success: true, data: { liveId, participantId: user.publicId } });
  } catch (e) { return mobileApiError(e, "LIVE_INVITE_FAILED"); }
}
