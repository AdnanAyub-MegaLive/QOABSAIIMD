import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { respondVideoInvite } from "@/lib/video-guests";
import { emitToVideoLive, emitToUser } from "@/lib/realtime";
import { updateLiveKitPublishPermission } from "@/lib/livekit-authorization";
export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request), { liveId } = await params, body = await request.json();
    const data = await respondVideoInvite(liveId, user.id, body.accept);
    if (data.status === "APPROVED") {
      try { await updateLiveKitPublishPermission(`video-${liveId}`, user.publicId, true); }
      catch (error) { console.error("Guest permission refresh failed; client should request a new token", error); }
    }
    emitToVideoLive(liveId, "live-video:guests-changed", { success: true, data });
    emitToUser(user.publicId, "live-video:guest-response", { success: true, data });
    return mobileJson({ success: true, data });
  } catch (error) { return mobileApiError(error, "LIVE_INVITE_RESPONSE_FAILED"); }
}
export { mobileOptions as OPTIONS } from "@/lib/mobile-api";
