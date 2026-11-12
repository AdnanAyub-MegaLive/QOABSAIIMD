import { adminMessageMedia } from "@/lib/admin-message-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request, context) { return adminMessageMedia(request, context, "media"); }
