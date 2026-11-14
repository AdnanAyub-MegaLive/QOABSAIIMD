import { loadAppVersionSettings, versionDecision } from "@/lib/app-version";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/app/version";
const methods = "GET, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ requestId }) => {
    const query = new URL(request.url).searchParams;
    const platform = (query.get("platform") || "android").trim().toLowerCase();
    if (platform !== "android") {
      return v1Json(request, requestId, { success: false, error: { code: "UNSUPPORTED_PLATFORM", message: "Only the android platform is supported." } }, 422, methods);
    }
    const settings = await loadAppVersionSettings();
    return v1Json(request, requestId, { success: true, data: versionDecision(settings, query.get("versionCode")) }, 200, methods);
  });
}
