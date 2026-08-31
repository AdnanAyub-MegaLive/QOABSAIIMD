import { GET as legacyGet } from "@/app/api/wallet/transactions/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/wallet/transactions";
const methods = "GET, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60_000 } }, () => legacyGet(request));
}
