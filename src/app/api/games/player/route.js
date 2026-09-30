import { prisma } from "@/lib/prisma";
import { placeRound, assertPlayer, serializeGame, GameError } from "@/lib/game-control/service";
import { sameOrigin, jsonBody, launchPlayer, playerSession, failure, gameJson, limit } from "@/lib/game-control/http";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    sameOrigin(request);
    const body = await jsonBody(request);
    if (body.action === "launch") limit(`launch:${request.headers.get("x-forwarded-for") || "local"}`, 30);
    const identity = body.action === "launch" ? await launchPlayer(body.token, body.roomId) : await playerSession();
    limit(identity.userId);
    if (["launch", "profile"].includes(body.action)) {
      const user = await assertPlayer(prisma, identity);
      const games = await prisma.gameDefinition.findMany({ orderBy: { createdAt: "asc" } });
      return gameJson({ user: { userId: user.publicId, nickname: user.name, availableCoins: user.coinBalance.toString() }, roomId: identity.roomId, games: games.map(serializeGame).filter((game) => game.status === "active" && game.engine !== "external"), live: true });
    }
    if (body.action === "bet") return gameJson({ round: await placeRound(identity, body) });
    if (body.action === "round") {
      if (typeof body.id !== "string") throw new GameError("Invalid round ID.");
      const row = await prisma.gameRound.findFirst({ where: { id: body.id, userId: identity.userId } });
      if (!row) throw new GameError("Round not found.", 404);
      return gameJson({ round: row.payload });
    }
    throw new GameError("Unknown action.");
  } catch (error) { return failure(error); }
}
