import { GET as legacyGet, POST as legacyPost } from "@/app/api/audio-rooms/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/audio-rooms";
const methods = "GET, POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60_000 } }, () => legacyGet(request));
}
export async function POST(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 20, windowMs: 60_000 } }, () => legacyPost(request));
}
