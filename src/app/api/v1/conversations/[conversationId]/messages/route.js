import { GET as legacyGet, POST as legacyPost } from "@/app/api/conversations/[conversationId]/messages/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/conversations/:conversationId/messages";
const methods = "GET, POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request, context) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60_000 } }, () => legacyGet(request, context));
}
export async function POST(request, context) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, () => legacyPost(request, context));
}
