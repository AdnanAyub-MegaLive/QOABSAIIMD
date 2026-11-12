import { prisma } from "../../../../lib/prisma";
import { setUserPassword } from "@/lib/user-password";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "../../../../lib/mobile-api";

export function OPTIONS() { return mobileOptions(); }
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    let body;
    try { body = await request.json(); }
    catch { return mobileJson({ success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400); }
    return mobileJson({ success: true, data: await setUserPassword(prisma, user, body) });
  } catch (error) {
    if (error.status && error.status < 500) {
      const response = await mobileJson({ success: false, error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, error.status);
      if (error.retryAfter) response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
    console.error("Self-service password change failed", error);
    return mobileApiError(error, "PASSWORD_CHANGE_FAILED");
  }
}
