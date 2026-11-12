import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { videoPkQueue } from "@/lib/video-pk";
import { requireVerifiedLiveHost } from "@/lib/live-host-policy";
import { finalizeExpiredPkSessions } from "@/lib/live-maintenance";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request), { liveId } = await params;
    await requireVerifiedLiveHost(user.id);
    await finalizeExpiredPkSessions();
    return mobileJson({ success: true, data: await videoPkQueue(prisma, user, liveId, await request.json()) });
  } catch (e) { return mobileApiError(e, "LIVE_PK_RANDOM_FAILED"); }
}
