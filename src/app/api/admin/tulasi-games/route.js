import { portalPermissionError, requirePortalAdmin } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { tulasiConfig } from "@/lib/tulasi/config";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error) => { if (!error.status) console.error("Tulasi admin failed", error); return json({ success: false, error: { message: error.status ? error.message : "Unable to update provider games." } }, error.status || 500); };

export async function GET() {
  const denied = await portalPermissionError("roomGames.view");
  if (denied) return denied;
  try {
    if (!await requirePortalAdmin()) return json({ success: false, error: { message: "Administrator access is required." } }, 401);
    const games = await prisma.tulasiGame.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return json({ success: true, data: { configured: tulasiConfig().enabled, games: games.map((g) => ({ gameId: g.tulasiId, name: g.name, identification: g.gameIdentification, image: g.image, providerStatus: g.providerStatus, enabled: g.enabled, sortOrder: g.sortOrder, expirationDate: g.expirationDate, syncedAt: g.syncedAt })) } });
  } catch (error) { return fail(error); }
}

export async function PATCH(request) {
  const denied = await portalPermissionError("roomGames.edit");
  if (denied) return denied;
  try {
    sameOrigin(request);
    if (!await requirePortalAdmin()) return json({ success: false, error: { message: "Administrator access is required." } }, 401);
    const body = await jsonBody(request);
    const gameId = Number(body.gameId);
    const data = {};
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (Number.isSafeInteger(body.sortOrder) && body.sortOrder >= 0 && body.sortOrder <= 9999) data.sortOrder = body.sortOrder;
    if (!Number.isSafeInteger(gameId) || !Object.keys(data).length) return json({ success: false, error: { message: "Send gameId with enabled or sortOrder." } }, 422);
    const game = await prisma.tulasiGame.update({ where: { tulasiId: gameId }, data });
    return json({ success: true, data: { gameId: game.tulasiId, enabled: game.enabled, sortOrder: game.sortOrder } });
  } catch (error) { return fail(error.code === "P2025" ? Object.assign(new Error("Game not found."), { status: 404 }) : error); }
}
