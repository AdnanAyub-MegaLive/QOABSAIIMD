import { GET as recent } from "@/app/api/audio-rooms/recent/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";
const path = "/api/v1/audio-rooms/recent", methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export function GET(request) { return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60000 } }, () => recent(request)); }
