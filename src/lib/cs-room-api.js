import { prisma } from "./prisma.js";
import { mobileApiError, mobileJson, requireMobileUser } from "./mobile-api.js";
import { withV1Request } from "./mobile-v1.js";
import { isRateLimited } from "./rate-limit.js";
import { avatarDisplayUrl } from "./avatar-history.js";
import { requestOrigin, resolveUserPerks } from "./user-perks.js";
import { perkMediaFields } from "./decoration-media.js";
import { rtcProvider } from "./rtc-provider.js";
import { issueTrtcAccess } from "./trtc-authorization.js";
import { CS_LEGACY_MAX_VERSION, csRoomsSnapshot, csRtcRoomId, sweepCsRooms } from "./cs-rooms.js";

export function csRoomRequest(request, path, methods, work) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const user = await requireMobileUser(request);
      const versionCode = Number.parseInt(request.headers.get("x-app-version-code") ?? "", 10);
      user.csLegacy = !Number.isInteger(versionCode) || versionCode <= CS_LEGACY_MAX_VERSION;
      if (isRateLimited(`cs-room:${user.id}`, { limit: 90, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Please wait before trying again." } }, 429);
      return mobileJson({ success: true, data: await work(user) });
    } catch (error) {
      if ((error.code?.startsWith("CS_") || error.code === "VALIDATION_ERROR") && error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message, ...(error.until ? { until: error.until } : {}) } }, error.status);
      if (error instanceof SyntaxError) return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON request." } }, 422);
      return mobileApiError(error, "CS_ROOM_FAILED");
    }
  });
}

const PERSON_CACHE_MS = 15_000;

const detailedRooms = (snapshot) => snapshot.rooms.filter((room) => room.country === snapshot.joinedCountry || room.country === snapshot.staffCountry);

function snapshotPeople(snapshot) {
  const ids = new Set();
  for (const room of snapshot.rooms) { const agent = room.seats.find((seat) => seat.agentSeat)?.occupant; if (agent) ids.add(agent.publicId); }
  for (const room of detailedRooms(snapshot)) {
    for (const seat of room.seats) if (seat.occupant) ids.add(seat.occupant.publicId);
    for (const person of [...(room.queue ?? []), ...(room.listenerList ?? [])]) ids.add(person.publicId);
  }
  return [...ids].sort();
}

async function personDetails(snapshot, origin) {
  const ids = snapshotPeople(snapshot);
  if (!ids.length) return new Map();
  globalThis.portalCsPersonCache ??= new Map();
  const cache = globalThis.portalCsPersonCache;
  const key = `${origin}|${ids.join(",")}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.details;
  const users = await prisma.user.findMany({ where: { publicId: { in: ids } }, select: { id: true, publicId: true, gender: true, isOfficial: true } });
  const perks = await resolveUserPerks(users, origin, ["FRAMES", "BADGES", "USER_TAGS"]);
  const details = new Map(users.map((u) => {
    const p = perks.get(u.publicId);
    return [u.publicId, { ...p?.progression, ...perkMediaFields(p, ["frame", "badge", "userTag"]), vipPrivileges: undefined, specialId: undefined, frameUrl: p?.frameUrl ?? null, framePosterUrl: p?.framePosterUrl ?? null, frameMimeType: p?.frameMimeType ?? null, badgeUrl: p?.badgeUrl ?? null, userTagUrl: p?.userTagUrl ?? null, userTagMimeType: p?.userTagMimeType ?? null, gender: u.gender ?? null, isOfficial: Boolean(u.isOfficial), invisible: (p?.vipPrivileges ?? []).includes("INVISIBLE_ENTRY") }];
  }));
  if (cache.size > 200) cache.clear();
  cache.set(key, { details, until: Date.now() + PERSON_CACHE_MS });
  return details;
}

export async function csRoomState(request, user, country = null, withRtc = false) {
  await sweepCsRooms(prisma);
  const origin = requestOrigin(request);
  const snapshot = await csRoomsSnapshot(prisma, user, (value) => avatarDisplayUrl(value, origin));
  try {
    const details = await personDetails(snapshot, origin);
    const fill = (person) => Object.assign(person, details.get(person.publicId) ?? {}, { publicId: person.publicId, name: person.name, profileImage: person.profileImage });
    const detailed = new Set(detailedRooms(snapshot).map((room) => room.country));
    for (const room of snapshot.rooms) {
      if (detailed.has(room.country)) continue;
      const agent = room.seats.find((seat) => seat.agentSeat)?.occupant;
      const d = agent && details.get(agent.publicId);
      if (d) Object.assign(agent, { frameUrl: d.frameUrl, framePosterUrl: d.framePosterUrl, frameMimeType: d.frameMimeType });
    }
    for (const room of detailedRooms(snapshot)) {
      for (const seat of room.seats) if (seat.occupant) fill(seat.occupant);
      for (const person of [...(room.queue ?? []), ...(room.listenerList ?? [])]) fill(person);
      if (room.country !== snapshot.staffCountry) room.listenerList = (room.listenerList ?? []).filter((person) => !person.invisible);
      for (const person of [...room.seats.map((seat) => seat.occupant).filter(Boolean), ...(room.queue ?? []), ...(room.listenerList ?? [])]) delete person.invisible;
    }
  } catch (error) {
    console.error("CS room person details failed", error?.code ?? error?.name);
    for (const room of snapshot.rooms) if (room.country !== snapshot.staffCountry) room.listenerList = [];
  }
  if (!withRtc || !country) return snapshot;
  let trtc = null;
  try {
    if (rtcProvider() === "TRTC" && snapshot.joinedCountry === country) trtc = issueTrtcAccess(user, csRtcRoomId(country), snapshot.mySeat?.country === country && !snapshot.myMuted);
  } catch {
    trtc = null;
  }
  return { ...snapshot, trtc };
}
