import { POST as exchange } from "@/app/api/wallet/exchange/route";
import { v1Options, withV1Request } from "@/lib/mobile-v1";
const path = "/api/v1/wallet/exchange";
const methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export function POST(request) { return withV1Request(request, { path, methods, rateLimit: { limit: 10, windowMs: 60000 } }, () => exchange(request)); }
