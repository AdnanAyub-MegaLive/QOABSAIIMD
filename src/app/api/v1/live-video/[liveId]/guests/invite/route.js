import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { inviteVideoGuest } from "@/lib/video-guests";
import { emitToUser } from "@/lib/realtime";
const path = "/api/v1/live-video/:liveId/guests/invite", methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export function POST(request, { params }) { return withV1Request(request, { path, methods, rateLimit: { limit: 20, windowMs: 60000 } }, async () => {
  try {
    const user = await requireMobileUser(request), { liveId } = await params, body = await request.json();
    const result = await inviteVideoGuest(liveId, user.id, String(body.userPublicId ?? "").trim());
    emitToUser(result.publicId, "live-video:guest-invited", { success: true, data: result.data });
    return mobileJson({ success: true, data: result.data }, 201);
  } catch (error) { return mobileApiError(error, "LIVE_INVITE_FAILED"); }
}); }
