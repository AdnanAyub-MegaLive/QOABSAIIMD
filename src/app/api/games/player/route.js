import { prisma } from "@/lib/prisma";
import { assertPlayer, serializeGame, GameError } from "@/lib/game-control/service";
import { sharedSnapshot, enterSharedRound, answerSharedRound } from "@/lib/game-control/shared-games";
import { sameOrigin, jsonBody, launchPlayer, playerSession, failure, gameJson, limit } from "@/lib/game-control/http";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    sameOrigin(request);
    const body = await jsonBody(request);
    if (body.action === "launch") limit(`launch:${request.headers.get("x-forwarded-for") || "local"}`, 30);
    const identity = body.action === "launch" ? await launchPlayer(body.token, body.roomId) : await playerSession();
    limit(identity.userId);
    if (body.action === "refill") throw new GameError("Application coins cannot be refilled by a game.",400);
    if (["launch", "profile"].includes(body.action)) {
      const user = await assertPlayer(prisma, identity);
      const games = await prisma.gameDefinition.findMany({ orderBy: { createdAt: "asc" } });
      return gameJson({ user: { userId: user.publicId, nickname: user.name, availableCoins: user.coinBalance.toString() }, currency: "COINS", roomId: identity.roomId, games: games.map(serializeGame).filter((game) => game.status === "active" && game.engine !== "external"), live: true });
    }
    if (body.action === "shared-state") return gameJson(await sharedSnapshot(identity,body));
    if (body.action === "shared-enter") return gameJson({entry:await enterSharedRound(identity,body)});
    if (body.action === "shared-answer") return gameJson({entry:await answerSharedRound(identity,body)});
    if (["bet","challenge"].includes(body.action)) throw new GameError("Update the game page to join shared room rounds.",409);
    if (body.action === "round") {
      if (typeof body.id !== "string") throw new GameError("Invalid round ID.");
      await assertPlayer(prisma, identity);
      const row = await prisma.gamePlayRound.findFirst({ where: { id: body.id, userId: identity.userId } });
      if (!row) throw new GameError("Round not found.", 404);
      return gameJson({ round: row.payload });
    }
    throw new GameError("Unknown action.");
  } catch (error) { return failure(error); }
}
