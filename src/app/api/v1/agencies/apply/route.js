import { POST as apply } from "@/app/api/agencies/apply/route";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
const path = "/api/v1/agencies/apply";
const methods = "POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request) { return withV1Request(request, { path, methods }, () => apply(request)); }
