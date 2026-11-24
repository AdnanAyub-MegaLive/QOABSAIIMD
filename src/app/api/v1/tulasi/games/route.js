import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { v1Options, withV1Request } from "@/lib/mobile-v1";
import { listPlayableGames } from "@/lib/tulasi/catalog";
export const runtime = "nodejs";
const path = "/api/v1/tulasi/games";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60000 } }, async () => {
    try {
      await requireMobileUser(request);
      return mobileJson({ success: true, data: { games: await listPlayableGames(prisma) } });
    } catch (error) { return mobileApiError(error); }
  });
}
