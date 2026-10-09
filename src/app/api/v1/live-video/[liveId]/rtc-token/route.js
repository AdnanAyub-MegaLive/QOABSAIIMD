import { prisma } from "@/lib/prisma";
import { requireVerifiedLiveHost } from "@/lib/live-host-policy";
import { requireRtcMembership } from "@/lib/rtc-access";
import { issueTrtcAccess } from "@/lib/trtc-authorization";
import { issueLiveKitAccess } from "@/lib/livekit-authorization";
import { rtcProvider, rtcFields } from "@/lib/rtc-provider";
import { mobileApiError, mobileJson, requireMobileUser } from "@/lib/mobile-api";
import { v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
const path = "/api/v1/live-video/:liveId/rtc-token", methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request, context) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60000 } }, async () => {
    try {
      const user = await requireMobileUser(request), { liveId } = await context.params;
      const row = await prisma.videoLiveSession.findUnique({ where: { publicId: liveId }, include: { guestRequests: { where: { userId: user.id, status: "APPROVED" }, take: 1 } } });
      if (!row || row.status !== "LIVE") throw new Error("LIVE_NOT_FOUND");
      const ban = await prisma.videoLiveBan.findFirst({ where: { sessionId: row.id, userId: user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      if (ban) throw new Error("LIVE_BANNED");
      await requireRtcMembership(user, `live-video:${liveId}`);
      if (row.hostId === user.id) await requireVerifiedLiveHost(user.id);
      const canPublish = row.hostId === user.id || row.guestRequests.length > 0;
      const access = rtcProvider() === "TRTC" ? issueTrtcAccess(user, `video-${liveId}`, canPublish, { video: true }) : await issueLiveKitAccess(user, `video-${liveId}`, canPublish);
      return mobileJson({ success: true, data: { liveId, ...rtcFields(access) } });
    } catch (error) { return mobileApiError(error, "RTC_ACCESS_FAILED"); }
  });
}
