import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { isRateLimited } from "@/lib/rate-limit";
import { readAvatarUpload } from "@/lib/avatar-upload";
import { saveAgencyLogo } from "@/lib/agency-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`agency-logo:${user.id}`, { limit: 10, windowMs: 60000 }))
      return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Too many uploads. Try again in a minute." } }, 429);
    const { file, form } = await readAvatarUpload(request);
    const values = form.getAll("agencyId");
    if (values.length > 1 || (values.length && (typeof values[0] !== "string" || values[0].length > 100)))
      return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Provide one agency public ID." } }, 422);
    const data = await saveAgencyLogo(prisma, user.id, values[0]?.trim() || null, file, requestOrigin(request));
    return mobileJson({ success: true, data }, 201);
  } catch (error) {
    if (error.status || ["FILE_TOO_LARGE", "VALIDATION_ERROR"].includes(error.code))
      return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status || (error.code === "FILE_TOO_LARGE" ? 413 : 422));
    return mobileApiError(error, "AGENCY_LOGO_UPLOAD_FAILED");
  }
}
