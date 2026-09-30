import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import mobileSession from "../mobile-session.cjs";
import { GameError, assertPlayer } from "./service.js";
import { isRateLimited } from "../rate-limit.js";

const cookieName = "megalive_game_session";
const hash = (value) => createHash("sha256").update(value).digest("hex");
function isDevelopmentOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return false;
    return url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0" ||
      /^10(?:\.\d{1,3}){3}$/.test(url.hostname) ||
      /^192\.168(?:\.\d{1,3}){2}$/.test(url.hostname) ||
      /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(url.hostname);
  } catch { return false; }
}
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const configured = [process.env.AUTH_URL, process.env.MOBILE_API_BASE_URL]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value) => {
      try { return new URL(value).origin; } catch { return null; }
    })
    .filter(Boolean);
  const allowed = new Set(configured);
  if (process.env.NODE_ENV !== "production" || allowed.size === 0)
    allowed.add(new URL(request.url).origin);
  let normalizedOrigin = null;
  try { normalizedOrigin = origin ? new URL(origin).origin : null; } catch {}
  const developmentLanOrigin = process.env.NODE_ENV !== "production" && normalizedOrigin && isDevelopmentOrigin(normalizedOrigin);
  if (!normalizedOrigin || (!allowed.has(normalizedOrigin) && !developmentLanOrigin))
    throw new GameError("Open this page from the portal's configured origin.", 403);
}
export async function jsonBody(request) {
  const text = await request.text();
  if (text.length > 32768) throw new GameError("Request is too large.", 413);
  try { const body = JSON.parse(text); if (!body || Array.isArray(body) || typeof body !== "object") throw new Error(); return body; }
  catch { throw new GameError("Invalid JSON request."); }
}
export function limit(key, count = 60) {
  if (isRateLimited(`games:${key}`, { limit: count, windowMs: 60000 })) throw new GameError("Too many requests. Please wait a moment.", 429);
}
export async function launchPlayer(token, roomId) {
  let claims;
  try { claims = mobileSession.verifyMobileSessionToken(token); } catch { throw new GameError("Open the game using a valid Mega Live mobile session.", 401); }
  if (roomId != null && (typeof roomId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(roomId))) throw new GameError("Invalid room ID.");
  const user = await prisma.user.findUnique({ where: { publicId: claims.userId }, select: { id: true } });
  if (!user) throw new GameError("Player not found.", 401);
  const expiresAt = new Date(Math.min(claims.exp * 1000, Date.now() + 2 * 60 * 60 * 1000));
  const identity = { userId: user.id, claims, roomId: roomId || null, expiresAt };
  await assertPlayer(prisma, identity);
  const opaque = randomBytes(32).toString("base64url");
  await prisma.gamePlayerSession.create({ data: { ...identity, tokenHash: hash(opaque) } });
  const store = await cookies();
  store.set(cookieName, opaque, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/games/player", expires: expiresAt });
  return identity;
}
export async function playerSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) throw new GameError("Open this game from the Mega Live app to sign in.", 401);
  const identity = await prisma.gamePlayerSession.findUnique({ where: { tokenHash: hash(token) } });
  if (!identity) throw new GameError("Your game session expired. Reopen the game.", 401);
  await assertPlayer(prisma, identity);
  return identity;
}
export const gameJson = (body) => Response.json(body, { headers: { "Cache-Control": "no-store" } });
export function failure(error) {
  const status = error.status || (error.code === "P2002" ? 409 : 500);
  if (status === 500) console.error("Game request failed", error);
  return Response.json({ error: status === 500 ? "Unable to complete this game request." : error.code === "P2002" ? "This record already exists. Refresh and try again." : error.message }, { status, headers: { "Cache-Control": "no-store" } });
}
