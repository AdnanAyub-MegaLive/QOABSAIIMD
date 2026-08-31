import { POST as legacyPost } from "@/app/api/users/register/route";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/auth/register";
const methods = "POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 5, windowMs: 60_000 } }, async ({ requestId }) => {
    let body;
    try {
      body = await request.clone().json();
    } catch {
      return legacyPost(request);
    }
    if (!String(body?.device?.deviceId ?? "").trim()) {
      return v1Json(request, requestId, {
        success: false,
        error: {
          code: "DEVICE_ID_REQUIRED",
          message: "device.deviceId is required for v1 registration.",
        },
      }, 422, methods);
    }
    return legacyPost(request);
  });
}
