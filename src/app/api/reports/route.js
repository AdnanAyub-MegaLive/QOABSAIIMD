import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { isRateLimited } from "@/lib/rate-limit";
import { submitSafetyReport } from "@/lib/safety-reports";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`safety-report:${user.id}`, { limit: 10, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Too many reports. Try again in a minute." } }, 429);
    let body; try { body = await request.json(); } catch { return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Provide valid JSON." } }, 422); }
    return mobileJson({ success: true, data: await submitSafetyReport(prisma, user.id, body) }, 201);
  } catch (error) {
    if (error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
    return mobileApiError(error, "REPORT_FAILED");
  }
}
