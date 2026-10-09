import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { isRateLimited } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/user-perks";
import { readAvatarFile, decodeAvatar, saveAvatar } from "@/lib/avatar-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/users/me/avatar", methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export function POST(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const user = await requireMobileUser(request);
      if (isRateLimited(`avatar-upload:${user.id}`, { limit: 10, windowMs: 60000 })) {
        const response = mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Too many avatar uploads. Try again in a minute." } }, 429);
        response.headers.set("Retry-After", "60");
        return response;
      }
      const bytes = await decodeAvatar(await readAvatarFile(request));
      const profileImage = await saveAvatar(prisma, user.id, bytes, requestOrigin(request));
      return mobileJson({ success: true, data: { profileImage } }, 201);
    } catch (error) {
      if (error.code === "FILE_TOO_LARGE") return mobileJson({ success: false, error: { code: error.code, message: error.message } }, 413);
      const response = mobileApiError(error, "AVATAR_UPLOAD_FAILED");
      if (response.status >= 500) console.error("Avatar upload failed", { code: error.code ?? "UNKNOWN" });
      return response;
    }
  });
}
