import { prisma } from "@/lib/prisma.js";
import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api.js";
import { hostCenter } from "@/lib/host-center.js";
import { v1Options, withV1Request } from "@/lib/mobile-v1.js";

const path = "/api/v1/me/host-center";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60000 } }, async () => {
    try {
      const user = await requireMobileUser(request, { syncVip: false });
      const month = new URL(request.url).searchParams.get("month");
      const data = await prisma.$transaction(tx => hostCenter(tx, user.id, month), { isolationLevel: "RepeatableRead" });
      return mobileJson({ success: true, data });
    } catch (error) {
      if (error.code === "HOST_CENTER_FORBIDDEN") return mobileJson({ success: false, error: { code: error.code, message: error.message } }, 403);
      return mobileApiError(error, "HOST_CENTER_FAILED");
    }
  });
}
