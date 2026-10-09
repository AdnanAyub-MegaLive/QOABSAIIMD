import { POST as post } from "@/app/api/audio-rooms/rtc-token/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";
export const runtime = "nodejs";
const path = "/api/v1/audio-rooms/rtc-token", methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export function POST(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60000 } }, () => post(request));
}
