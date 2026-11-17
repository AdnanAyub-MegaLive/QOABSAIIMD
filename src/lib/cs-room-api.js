import { prisma } from "./prisma.js";
import { mobileApiError, mobileJson, requireMobileUser } from "./mobile-api.js";
import { withV1Request } from "./mobile-v1.js";
import { isRateLimited } from "./rate-limit.js";
import { avatarDisplayUrl } from "./avatar-history.js";
import { requestOrigin, resolveUserPerks } from "./user-perks.js";
import { rtcProvider } from "./rtc-provider.js";
import { issueTrtcAccess } from "./trtc-authorization.js";
import { csRoomsSnapshot, csRtcRoomId, sweepCsRooms } from "./cs-rooms.js";

export function csRoomRequest(request, path, methods, work) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const user = await requireMobileUser(request);
      if (isRateLimited(`cs-room:${user.id}`, { limit: 90, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Please wait before trying again." } }, 429);
      return mobileJson({ success: true, data: await work(user) });
    } catch (error) {
      if ((error.code?.startsWith("CS_") || error.code === "VALIDATION_ERROR") && error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message, ...(error.until ? { until: error.until } : {}) } }, error.status);
      if (error instanceof SyntaxError) return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON request." } }, 422);
      return mobileApiError(error, "CS_ROOM_FAILED");
    }
  });
}

const FRAME_CACHE_MS = 15_000;

async function seatFrames(snapshot, origin) {
  const ids = [...new Set(snapshot.rooms.map((room) => room.seats.find((seat) => seat.agentSeat)?.occupant?.publicId).filter(Boolean))].sort();
  if (!ids.length) return new Map();
  globalThis.portalCsFrameCache ??= new Map();
  const cache = globalThis.portalCsFrameCache;
  const key = `${origin}|${ids.join(",")}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.frames;
  const users = await prisma.user.findMany({ where: { publicId: { in: ids } }, select: { id: true, publicId: true } });
  const perks = await resolveUserPerks(users, origin, ["FRAMES"]);
  const frames = new Map(ids.map((id) => {
    const p = perks.get(id);
    return [id, { frameUrl: p?.frameUrl ?? null, framePosterUrl: p?.framePosterUrl ?? null, frameMimeType: p?.frameMimeType ?? null }];
  }));
  if (cache.size > 200) cache.clear();
  cache.set(key, { frames, until: Date.now() + FRAME_CACHE_MS });
  return frames;
}

export async function csRoomState(request, user, country = null, withRtc = false) {
  await sweepCsRooms(prisma);
  const origin = requestOrigin(request);
  const snapshot = await csRoomsSnapshot(prisma, user, (value) => avatarDisplayUrl(value, origin));
  try {
    const frames = await seatFrames(snapshot, origin);
    for (const room of snapshot.rooms) for (const seat of room.seats) if (seat.occupant) Object.assign(seat.occupant, frames.get(seat.occupant.publicId) ?? {});
  } catch (error) {
    console.error("CS room frames failed", error?.code ?? error?.name);
  }
  if (!withRtc || !country) return snapshot;
  let trtc = null;
  try {
    if (rtcProvider() === "TRTC") trtc = issueTrtcAccess(user, csRtcRoomId(country), snapshot.mySeat?.country === country && !snapshot.myMuted);
  } catch {
    trtc = null;
  }
  return { ...snapshot, trtc };
}
