import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requirePortalAdmin } from "@/lib/portal-admin";
import { saveGame, serializeGame, GameError } from "@/lib/game-control/service";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { catalogGame } from "@/lib/game-control/catalog.mjs";

function failure(error) {
  const status = error.status || (error.code === "P2002" ? 409 : 500);
  if (status === 500) console.error("Room game catalogue failed", error);
  return Response.json({ success: false, error: { message: status === 500 ? "Unable to save the game catalogue." : error.message } }, { status });
}
export async function GET(request) {
  try {
    if (!await requirePortalAdmin()) throw new GameError("Administrator access is required.", 401);
    const rows = await prisma.gameDefinition.findMany({ orderBy: { createdAt: "asc" } });
    const origin = process.env.MOBILE_API_BASE_URL || new URL(request.url).origin;
    const games = rows.map(serializeGame).map(game => {
      try { return catalogGame(game, origin); } catch { return { ...game, invalidLink: true }; }
    }).sort((a,b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
    return Response.json({ success: true, data: { games } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    sameOrigin(request);
    const admin = await requirePortalAdmin();
    if (!admin) throw new GameError("Administrator access is required.", 401);
    const body = await jsonBody(request);
    const row = body.id ? await prisma.gameDefinition.findUnique({ where: { id: String(body.id) } }) : null;
    if (body.id && !row) throw new GameError("Game not found.", 404);
    const game = row ? serializeGame(row) : { id: `link-${randomUUID()}`, engine: "external" };
    const result = await saveGame({ ...game, name: body.name, status: body.status, sortOrder: body.sortOrder,
      ...(game.engine === "external" ? { launchUrl: body.launchUrl } : {}), revision: body.revision }, admin.email);
    return Response.json({ success: true, data: result });
  } catch (error) { return failure(error); }
}
