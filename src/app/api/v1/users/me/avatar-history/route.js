import { prisma } from "@/lib/prisma";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";
import { requestOrigin } from "@/lib/user-perks";
import { readAvatarHistory } from "@/lib/avatar-history";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path: "/api/v1/users/me/avatar-history", methods, rateLimit: { limit: 60, windowMs: 60000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const items = await readAvatarHistory(prisma, user.id, requestOrigin(request));
      return v1Json(request, requestId, { success: true, data: { items } }, 200, methods);
    } catch (error) { return mobileApiError(error, "AVATAR_HISTORY_FAILED"); }
  });
}
