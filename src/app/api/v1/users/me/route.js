import { PATCH as legacyPatch } from "@/app/api/users/profile/route";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";
import { mobileUserProfile } from "@/lib/mobile-user-profile";
import { requestOrigin } from "@/lib/user-perks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/users/me";
const methods = "GET, PATCH, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const profile = await mobileUserProfile(user.id, requestOrigin(request));
      return v1Json(request, requestId, { success: true, data: { user: profile } }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "PROFILE_READ_FAILED");
    }
  });
}
export async function PATCH(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, () => legacyPatch(request));
}
