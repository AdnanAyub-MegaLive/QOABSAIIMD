import { PATCH as legacyPatch } from "@/app/api/users/profile/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/users/me";
const methods = "PATCH, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function PATCH(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, () => legacyPatch(request));
}
