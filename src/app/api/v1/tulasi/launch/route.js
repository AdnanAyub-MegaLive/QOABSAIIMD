import { prisma } from "@/lib/prisma";
import mobileSession from "@/lib/mobile-session.cjs";
import { requireMobileUser, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { v1Options, withV1Request } from "@/lib/mobile-v1";
import { requireRoomParticipant } from "@/lib/red-envelopes";
import { createLaunch, TulasiError } from "@/lib/tulasi/service";
import { designSize, isPlayable } from "@/lib/tulasi/catalog";
export const runtime = "nodejs";
const path = "/api/v1/tulasi/launch";
const methods = "POST, OPTIONS";
const fail = (code, message, status) => mobileJson({ success: false, error: { code, message } }, status);
export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 20, windowMs: 60000 } }, async () => {
    try {
      const user = await requireMobileUser(request, { syncVip: false });
      const claims = mobileSession.verifyMobileSessionToken(request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
      let body;
      try { body = await request.json(); } catch { return fail("INVALID_REQUEST", "Send JSON with gameId and roomId.", 422); }
      const gameId = Number(body?.gameId);
      const roomId = typeof body?.roomId === "string" ? body.roomId.trim() : "";
      if (!Number.isSafeInteger(gameId) || !/^[A-Za-z0-9_-]{1,100}$/.test(roomId)) return fail("INVALID_REQUEST", "gameId and roomId are required.", 422);
      const game = await prisma.tulasiGame.findUnique({ where: { tulasiId: gameId } });
      if (!game || !isPlayable(game)) return fail("GAME_UNAVAILABLE", "This game is not available.", 404);
      try { await requireRoomParticipant(roomId, user.publicId); }
      catch (error) { return fail(error.code || "ROOM_PARTICIPANT_REQUIRED", "Join the room before opening a game.", 403); }
      const launch = await createLaunch({ user, claims, game, roomId, lang: typeof body.lang === "string" ? body.lang : "en" });
      return mobileJson({ success: true, data: { gameId, name: game.name, url: launch.url, expiresAt: launch.expiresAt.toISOString(), ...designSize(game.gameIdentification) } });
    } catch (error) {
      if (error instanceof TulasiError) return fail("GAME_UNAVAILABLE", error.message, error.status);
      return mobileApiError(error);
    }
  });
}
