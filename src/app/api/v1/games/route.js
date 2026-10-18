import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { serializeGame } from "@/lib/game-control/service";
import { visibleGames } from "@/lib/game-control/catalog.mjs";
import { attachGameIcons } from "@/lib/game-control/catalog-icons";
import { v1Options, withV1Request } from "@/lib/mobile-v1";
export const runtime = "nodejs";
const path = "/api/v1/games";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60000 } }, async () => {
    try {
      await requireMobileUser(request);
      const rows = await prisma.gameDefinition.findMany({ orderBy: { createdAt: "asc" } });
      const origin = process.env.MOBILE_API_BASE_URL || new URL(request.url).origin;
      return mobileJson({ success: true, data: { games: await attachGameIcons(prisma, visibleGames(rows.map(serializeGame), origin), origin) } });
    } catch (error) { return mobileApiError(error); }
  });
}
