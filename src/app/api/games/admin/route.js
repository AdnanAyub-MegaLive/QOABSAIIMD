import { auth } from "../../../../../auth.js";
import { prisma } from "@/lib/prisma";
import { ensureGames, saveGame, serializeGame, GameError } from "@/lib/game-control/service";
import { sameOrigin, jsonBody, failure, gameJson } from "@/lib/game-control/http";
export const runtime = "nodejs";
export async function POST(request) {
  try {
    sameOrigin(request);
    const session = await auth();
    if (!session?.user) throw new GameError("Sign in to the main portal to manage games.", 401);
    const body = await jsonBody(request);
    if (body.action === "saveGame") return gameJson(await saveGame(body.game, session.user.email || "Portal administrator"));
    if (body.action === "snapshot") {
      await ensureGames();
      const [games, rounds, audit, totalRounds] = await Promise.all([
        prisma.gameDefinition.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.gameRound.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1000 }),
        prisma.gameSettingsAudit.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
        prisma.gameRound.count(),
      ]);
      return gameJson({ games: games.map(serializeGame), rounds: rounds.map((r) => r.payload), audit: audit.map((a) => a.payload), totalRounds, integration: { database: true, wallet: true, launch: true, live: true } });
    }
    if (body.action === "olderRounds") {
      if (typeof body.beforeId !== "string" || typeof body.before !== "string" || !Number.isFinite(Date.parse(body.before))) throw new GameError("Invalid log cursor.");
      const before = new Date(body.before);
      const rounds = await prisma.gameRound.findMany({ where: { OR: [{ createdAt: { lt: before } }, { createdAt: before, id: { lt: body.beforeId } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1000 });
      return gameJson({ rounds: rounds.map((r) => r.payload) });
    }
    throw new GameError("Unknown action.");
  } catch (error) { return failure(error); }
}
