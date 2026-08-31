import { POST as legacyPost } from "@/app/api/wallet/transfers/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/wallet/transfers";
const methods = "POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 10, windowMs: 60_000 } }, () => legacyPost(request));
}
