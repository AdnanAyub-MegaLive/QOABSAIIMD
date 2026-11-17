import { normalizeSignupCountry } from "./geo-country.js";

export const CS_ROOM_COUNTRIES = ["PK", "IN", "BD", "SA", "AE", "QA", "NP", "LK", "ID", "MY", "PH", "TR", "GB", "US", "CA"];
export const CS_SEAT_INDEXES = [0, 1, 2, 3, 4];
export const CS_AGENT_SEAT = 0;
export const CS_PRESENCE_STALE_MS = 45_000;
const CS_ROLES = ["CS", "CS_LEADER"];

function fail(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

export function csRoomCountry(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!CS_ROOM_COUNTRIES.includes(code)) throw fail("CS_ROOM_NOT_FOUND", "This support room does not exist.", 404);
  return code;
}

export function csStaffCountry(user) {
  if (!Array.isArray(user?.appRoles) || !user.appRoles.some((role) => CS_ROLES.includes(role))) return null;
  return normalizeSignupCountry(user.country) ?? "";
}

export function assertCsRoomEntry(user, country) {
  const staff = csStaffCountry(user);
  if (staff !== null && staff !== country) throw fail("CS_ROOM_OTHER_COUNTRY", "Support staff can only join their own country's support room.", 403);
}

export function assertCsSeat(user, country, seatIndex) {
  if (!Number.isInteger(seatIndex) || !CS_SEAT_INDEXES.includes(seatIndex)) throw fail("VALIDATION_ERROR", "Invalid seat.", 422);
  assertCsRoomEntry(user, country);
  const staff = csStaffCountry(user);
  if (seatIndex === CS_AGENT_SEAT && staff !== country) throw fail("CS_SEAT_STAFF_ONLY", "Only this country's support team can use the support seat.", 403);
  if (seatIndex !== CS_AGENT_SEAT && staff !== null) throw fail("CS_SEAT_USERS_ONLY", "Support staff can only use the support seat.", 403);
  const home = normalizeSignupCountry(user?.country);
  if (staff === null && home && CS_ROOM_COUNTRIES.includes(home) && home !== country) throw fail("CS_SEAT_OWN_COUNTRY", "You can only take a seat in your own country's support room.", 403);
}

export async function sweepCsRooms(db, now = new Date()) {
  const cutoff = new Date(now.getTime() - CS_PRESENCE_STALE_MS);
  const stale = await db.csRoomPresence.findMany({ where: { lastSeenAt: { lt: cutoff } }, select: { userId: true } });
  const ids = stale.map((row) => row.userId);
  if (ids.length) {
    await db.csRoomSeat.updateMany({ where: { occupantUserId: { in: ids } }, data: { occupantUserId: null, occupiedAt: null } });
    await db.csRoomPresence.deleteMany({ where: { userId: { in: ids }, lastSeenAt: { lt: cutoff } } });
  }
  const seated = await db.csRoomSeat.findMany({ where: { occupantUserId: { not: null } }, select: { id: true, country: true, occupantUserId: true } });
  if (seated.length) {
    const present = await db.csRoomPresence.findMany({ where: { userId: { in: seated.map((s) => s.occupantUserId) } }, select: { userId: true, country: true } });
    const where = new Map(present.map((p) => [p.userId, p.country]));
    const orphan = seated.filter((s) => where.get(s.occupantUserId) !== s.country).map((s) => s.id);
    if (orphan.length) await db.csRoomSeat.updateMany({ where: { id: { in: orphan } }, data: { occupantUserId: null, occupiedAt: null } });
  }
}

async function ensureSeats(db, country) {
  await db.csRoomSeat.createMany({ data: CS_SEAT_INDEXES.map((seatIndex) => ({ country, seatIndex })), skipDuplicates: true });
}

export async function enterCsRoom(db, user, country, now = new Date()) {
  assertCsRoomEntry(user, country);
  await db.csRoomSeat.updateMany({ where: { occupantUserId: user.id, NOT: { country } }, data: { occupantUserId: null, occupiedAt: null } });
  await db.csRoomPresence.upsert({ where: { userId: user.id }, create: { userId: user.id, country, lastSeenAt: now }, update: { country, lastSeenAt: now } });
}

export async function heartbeatCsRoom(db, user, country, now = new Date()) {
  assertCsRoomEntry(user, country);
  const updated = await db.csRoomPresence.updateMany({ where: { userId: user.id, country }, data: { lastSeenAt: now } });
  if (!updated.count) throw fail("CS_ROOM_NOT_JOINED", "Join the support room first.", 409);
  const seat = await db.csRoomSeat.findFirst({ where: { occupantUserId: user.id }, select: { country: true, seatIndex: true } });
  if (!seat) return;
  try { assertCsSeat(user, seat.country, seat.seatIndex); }
  catch { await db.csRoomSeat.updateMany({ where: { occupantUserId: user.id }, data: { occupantUserId: null, occupiedAt: null } }); }
}

export async function leaveCsRoom(db, user) {
  await db.csRoomSeat.updateMany({ where: { occupantUserId: user.id }, data: { occupantUserId: null, occupiedAt: null } });
  await db.csRoomPresence.deleteMany({ where: { userId: user.id } });
}

export async function takeCsSeat(db, user, country, seatIndex, now = new Date()) {
  assertCsSeat(user, country, seatIndex);
  const presence = await db.csRoomPresence.findUnique({ where: { userId: user.id }, select: { country: true } });
  if (presence?.country !== country) throw fail("CS_ROOM_NOT_JOINED", "Join the support room first.", 409);
  await ensureSeats(db, country);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cs-seat:" + user.id}))`;
    const current = await tx.csRoomSeat.findUnique({ where: { country_seatIndex: { country, seatIndex } }, select: { occupantUserId: true } });
    if (current?.occupantUserId === user.id) return;
    if (current?.occupantUserId) throw fail("CS_SEAT_TAKEN", "This seat is already taken.", 409);
    await tx.csRoomSeat.updateMany({ where: { occupantUserId: user.id }, data: { occupantUserId: null, occupiedAt: null } });
    const taken = await tx.csRoomSeat.updateMany({ where: { country, seatIndex, occupantUserId: null }, data: { occupantUserId: user.id, occupiedAt: now } });
    if (!taken.count) throw fail("CS_SEAT_TAKEN", "This seat is already taken.", 409);
  }).catch((error) => {
    if (error?.code === "P2002" || error?.code === "P2034") throw fail("CS_SEAT_TAKEN", "This seat is already taken.", 409);
    throw error;
  });
}

export async function leaveCsSeat(db, user) {
  await db.csRoomSeat.updateMany({ where: { occupantUserId: user.id }, data: { occupantUserId: null, occupiedAt: null } });
}

export async function csRoomsSnapshot(db, user, avatar = (value) => value) {
  const [seats, presence] = await Promise.all([
    db.csRoomSeat.findMany({ where: { occupantUserId: { not: null } }, select: { country: true, seatIndex: true, occupantUserId: true } }),
    db.csRoomPresence.groupBy({ by: ["country"], _count: { _all: true } }),
  ]);
  const people = seats.length ? await db.user.findMany({ where: { id: { in: seats.map((s) => s.occupantUserId) } }, select: { id: true, publicId: true, name: true, profileImage: true } }) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const counts = new Map(presence.map((p) => [p.country, p._count._all]));
  const mine = await db.csRoomPresence.findUnique({ where: { userId: user.id }, select: { country: true } });
  const mySeat = seats.find((s) => s.occupantUserId === user.id);
  return {
    staffCountry: csStaffCountry(user),
    joinedCountry: mine?.country ?? null,
    mySeat: mySeat ? { country: mySeat.country, seatIndex: mySeat.seatIndex } : null,
    rooms: CS_ROOM_COUNTRIES.map((country) => ({
      country,
      listeners: counts.get(country) ?? 0,
      seats: CS_SEAT_INDEXES.map((seatIndex) => {
        const seat = seats.find((s) => s.country === country && s.seatIndex === seatIndex);
        const person = seat ? byId.get(seat.occupantUserId) : null;
        return { seatIndex, agentSeat: seatIndex === CS_AGENT_SEAT, occupant: person ? { publicId: person.publicId, name: person.name, profileImage: avatar(person.profileImage) } : null };
      }),
    })),
  };
}

export function csRtcRoomId(country) {
  return `cs-${country}`;
}
