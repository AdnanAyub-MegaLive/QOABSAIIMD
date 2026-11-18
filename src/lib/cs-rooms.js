import { normalizeSignupCountry } from "./geo-country.js";

export const CS_ROOM_COUNTRIES = ["PK", "IN", "BD", "SA", "ID", "PH", "NG", "BR", "EG", "IQ"];
export const CS_SEAT_INDEXES = [0, 1, 2, 3, 4];
export const CS_AGENT_SEAT = 0;
export const CS_PRESENCE_STALE_MS = 90_000;
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
    await db.csRoomQueue.deleteMany({ where: { userId: { in: ids } } });
  }
  const seated = await db.csRoomSeat.findMany({ where: { occupantUserId: { not: null } }, select: { id: true, country: true, occupantUserId: true } });
  if (seated.length) {
    const present = await db.csRoomPresence.findMany({ where: { userId: { in: seated.map((s) => s.occupantUserId) } }, select: { userId: true, country: true } });
    const where = new Map(present.map((p) => [p.userId, p.country]));
    const orphan = seated.filter((s) => where.get(s.occupantUserId) !== s.country).map((s) => s.id);
    if (orphan.length) await db.csRoomSeat.updateMany({ where: { id: { in: orphan } }, data: { occupantUserId: null, occupiedAt: null } });
  }
  try { await promoteCsQueues(db, now); }
  catch (error) { console.error("CS queue promotion failed", error?.code ?? error?.name); }
}

const CS_USER_SEATS = CS_SEAT_INDEXES.filter((index) => index !== CS_AGENT_SEAT);

async function queueEligible(tx, row, country, now) {
  const cutoff = new Date(now.getTime() - CS_PRESENCE_STALE_MS);
  const presence = await tx.csRoomPresence.findUnique({ where: { userId: row.userId }, select: { country: true, removedAt: true, lastSeenAt: true } });
  if (presence?.country !== country || presence.removedAt || presence.lastSeenAt < cutoff) return null;
  if (await activeCsBan(tx, row.userId, country, now)) return null;
  if (await tx.csRoomSeat.findFirst({ where: { occupantUserId: row.userId }, select: { id: true } })) return null;
  const user = await tx.user.findUnique({ where: { id: row.userId }, select: { id: true, appRoles: true, country: true, status: true, deletedAt: true } });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) return null;
  try { assertCsSeat(user, country, CS_USER_SEATS[0]); } catch { return null; }
  return user;
}

export async function promoteCsQueues(db, now = new Date()) {
  const waiting = await db.csRoomQueue.findMany({ select: { country: true }, distinct: ["country"] });
  for (const { country } of waiting) {
    const free = await db.csRoomSeat.count({ where: { country, seatIndex: { in: CS_USER_SEATS }, occupantUserId: null } });
    const seatsMade = await db.csRoomSeat.count({ where: { country, seatIndex: { in: CS_USER_SEATS } } });
    if (!free && seatsMade === CS_USER_SEATS.length) continue;
    await ensureSeats(db, country);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"cs-queue:" + country}))`;
      const queue = await tx.csRoomQueue.findMany({ where: { country }, orderBy: [{ joinedAt: "asc" }, { userId: "asc" }] });
      for (const row of queue) {
        const seat = await tx.csRoomSeat.findFirst({ where: { country, seatIndex: { in: CS_USER_SEATS }, occupantUserId: null }, orderBy: { seatIndex: "asc" }, select: { seatIndex: true } });
        if (!seat) break;
        const user = await queueEligible(tx, row, country, now);
        if (!user) { await tx.csRoomQueue.deleteMany({ where: { userId: row.userId, country } }); continue; }
        const seated = await tx.csRoomSeat.updateMany({ where: { country, seatIndex: seat.seatIndex, occupantUserId: null }, data: { occupantUserId: user.id, occupiedAt: now } });
        if (!seated.count) break;
        await tx.csRoomQueue.deleteMany({ where: { userId: row.userId, country } });
      }
    }).catch((error) => {
      if (error?.code !== "P2002" && error?.code !== "P2034") throw error;
    });
  }
}

export async function joinCsQueue(db, user, country, now = new Date()) {
  assertCsSeat(user, country, CS_USER_SEATS[0]);
  const presence = await db.csRoomPresence.findUnique({ where: { userId: user.id }, select: { country: true, removedAt: true } });
  if (presence?.country !== country || presence.removedAt) throw fail("CS_ROOM_NOT_JOINED", "Join the support room first.", 409);
  if (await db.csRoomSeat.findFirst({ where: { occupantUserId: user.id }, select: { id: true } })) throw fail("CS_ALREADY_SEATED", "You already have a seat.", 409);
  const occupied = await db.csRoomSeat.count({ where: { country, seatIndex: { in: CS_USER_SEATS }, occupantUserId: { not: null } } });
  if (occupied < CS_USER_SEATS.length) throw fail("CS_QUEUE_NOT_FULL", "A seat is free. Tap it to sit.", 409);
  const existing = await db.csRoomQueue.findUnique({ where: { userId: user.id }, select: { country: true } });
  if (existing?.country === country) return;
  await db.csRoomQueue.upsert({ where: { userId: user.id }, create: { userId: user.id, country, joinedAt: now }, update: { country, joinedAt: now } });
}

export async function leaveCsQueue(db, user) {
  await db.csRoomQueue.deleteMany({ where: { userId: user.id } });
}

async function ensureSeats(db, country) {
  await db.csRoomSeat.createMany({ data: CS_SEAT_INDEXES.map((seatIndex) => ({ country, seatIndex })), skipDuplicates: true });
}

export const CS_BAN_MINUTES = [10, 60, 1440];

async function activeCsBan(db, userId, country, now) {
  return db.csRoomBan.findFirst({ where: { userId, country, expiresAt: { gt: now } }, select: { expiresAt: true } });
}

function bannedError(ban) {
  return Object.assign(fail("CS_ROOM_BANNED", "You are banned from this support room for now.", 403), { until: ban.expiresAt.toISOString() });
}

export async function enterCsRoom(db, user, country, now = new Date()) {
  assertCsRoomEntry(user, country);
  const ban = await activeCsBan(db, user.id, country, now);
  if (ban) throw bannedError(ban);
  await db.csRoomSeat.updateMany({ where: { occupantUserId: user.id, NOT: { country } }, data: { occupantUserId: null, occupiedAt: null } });
  await db.csRoomQueue.deleteMany({ where: { userId: user.id, NOT: { country } } });
  await db.csRoomPresence.upsert({ where: { userId: user.id }, create: { userId: user.id, country, lastSeenAt: now }, update: { country, lastSeenAt: now, removedAt: null } });
}

export async function heartbeatCsRoom(db, user, country, now = new Date()) {
  assertCsRoomEntry(user, country);
  const presence = await db.csRoomPresence.findUnique({ where: { userId: user.id }, select: { country: true, removedAt: true } });
  if (presence?.country === country && presence.removedAt) {
    await db.csRoomPresence.deleteMany({ where: { userId: user.id, removedAt: { not: null } } });
    const ban = await activeCsBan(db, user.id, country, now);
    if (ban) throw bannedError(ban);
    throw fail("CS_ROOM_REMOVED", "You were removed from this support room.", 409);
  }
  const updated = await db.csRoomPresence.updateMany({ where: { userId: user.id, country, removedAt: null }, data: { lastSeenAt: now } });
  if (!updated.count) throw fail("CS_ROOM_NOT_JOINED", "Join the support room first.", 409);
  const seat = await db.csRoomSeat.findFirst({ where: { occupantUserId: user.id }, select: { country: true, seatIndex: true } });
  if (!seat) return;
  try { assertCsSeat(user, seat.country, seat.seatIndex); }
  catch { await db.csRoomSeat.updateMany({ where: { occupantUserId: user.id }, data: { occupantUserId: null, occupiedAt: null } }); }
}

export async function leaveCsRoom(db, user) {
  await db.csRoomQueue.deleteMany({ where: { userId: user.id } });
  await db.csRoomSeat.updateMany({ where: { occupantUserId: user.id }, data: { occupantUserId: null, occupiedAt: null } });
  await db.csRoomPresence.deleteMany({ where: { userId: user.id } });
}

export async function takeCsSeat(db, user, country, seatIndex, now = new Date()) {
  assertCsSeat(user, country, seatIndex);
  const presence = await db.csRoomPresence.findUnique({ where: { userId: user.id }, select: { country: true, removedAt: true } });
  if (presence?.country !== country || presence.removedAt) throw fail("CS_ROOM_NOT_JOINED", "Join the support room first.", 409);
  const ban = await activeCsBan(db, user.id, country, now);
  if (ban) throw bannedError(ban);
  if (seatIndex !== CS_AGENT_SEAT && await db.csRoomQueue.count({ where: { country } })) throw fail("CS_SEAT_RESERVED", "Seats are being given to the waiting list in order.", 409);
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
  const [seats, presence, queue] = await Promise.all([
    db.csRoomSeat.findMany({ where: { occupantUserId: { not: null } }, select: { country: true, seatIndex: true, occupantUserId: true } }),
    db.csRoomPresence.groupBy({ by: ["country"], where: { removedAt: null }, _count: { _all: true } }),
    db.csRoomQueue.findMany({ orderBy: [{ joinedAt: "asc" }, { userId: "asc" }], select: { country: true, userId: true } }),
  ]);
  const mutes = seats.length ? await db.csRoomMute.findMany({ where: { userId: { in: seats.map((s) => s.occupantUserId) } }, select: { country: true, userId: true } }) : [];
  const muted = new Set(mutes.map((m) => `${m.country}|${m.userId}`));
  const personIds = [...new Set([...seats.map((s) => s.occupantUserId), ...queue.map((q) => q.userId)])];
  const people = personIds.length ? await db.user.findMany({ where: { id: { in: personIds } }, select: { id: true, publicId: true, name: true, profileImage: true } }) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const counts = new Map(presence.map((p) => [p.country, p._count._all]));
  const mine = await db.csRoomPresence.findUnique({ where: { userId: user.id }, select: { country: true, removedAt: true } });
  const joined = mine && !mine.removedAt ? mine.country : null;
  const myMuted = joined ? Boolean(await db.csRoomMute.findUnique({ where: { country_userId: { country: joined, userId: user.id } }, select: { userId: true } })) : false;
  const mySeat = seats.find((s) => s.occupantUserId === user.id);
  const myQueue = queue.find((q) => q.userId === user.id);
  return {
    myQueue: myQueue ? { country: myQueue.country, position: queue.filter((q) => q.country === myQueue.country).findIndex((q) => q.userId === user.id) + 1 } : null,
    staffCountry: csStaffCountry(user),
    joinedCountry: joined,
    myMuted,
    mySeat: mySeat ? { country: mySeat.country, seatIndex: mySeat.seatIndex } : null,
    rooms: CS_ROOM_COUNTRIES.map((country) => ({
      country,
      listeners: counts.get(country) ?? 0,
      queue: queue.filter((q) => q.country === country).map((q) => byId.get(q.userId)).filter(Boolean).map((p) => ({ publicId: p.publicId, name: p.name, profileImage: avatar(p.profileImage) })),
      seats: CS_SEAT_INDEXES.map((seatIndex) => {
        const seat = seats.find((s) => s.country === country && s.seatIndex === seatIndex);
        const person = seat ? byId.get(seat.occupantUserId) : null;
        return { seatIndex, agentSeat: seatIndex === CS_AGENT_SEAT, occupant: person ? { publicId: person.publicId, name: person.name, profileImage: avatar(person.profileImage), forceMuted: muted.has(`${country}|${seat.occupantUserId}`) } : null };
      }),
    })),
  };
}

export function csRtcRoomId(country) {
  return `cs-${country}`;
}

export async function moderateCsRoom(db, actor, country, { action, targetId, seatIndex, minutes } = {}, now = new Date()) {
  if (csStaffCountry(actor) !== country) throw fail("CS_ADMIN_ONLY", "Only this country's support team can manage this room.", 403);
  const own = await db.csRoomPresence.findUnique({ where: { userId: actor.id }, select: { country: true, removedAt: true } });
  if (own?.country !== country || own.removedAt) throw fail("CS_ROOM_NOT_JOINED", "Join the support room first.", 409);
  if (typeof targetId !== "string" || !targetId.trim()) throw fail("VALIDATION_ERROR", "Choose a user.", 422);
  const target = await db.user.findUnique({ where: { publicId: targetId.trim() }, select: { id: true, publicId: true, appRoles: true, country: true } });
  if (!target) throw fail("CS_TARGET_NOT_FOUND", "This user was not found.", 404);
  if (target.id === actor.id || csStaffCountry(target) !== null) throw fail("CS_TARGET_STAFF", "Support staff cannot be managed here.", 403);
  const clearSeat = () => db.csRoomSeat.updateMany({ where: { occupantUserId: target.id, country }, data: { occupantUserId: null, occupiedAt: null } });
  const removePresence = async () => { await db.csRoomQueue.deleteMany({ where: { userId: target.id, country } }); return db.csRoomPresence.updateMany({ where: { userId: target.id, country }, data: { removedAt: now } }); };
  switch (action) {
    case "mute":
      await db.csRoomMute.upsert({ where: { country_userId: { country, userId: target.id } }, create: { country, userId: target.id, mutedById: actor.id }, update: { mutedById: actor.id } });
      return;
    case "unmute":
      await db.csRoomMute.deleteMany({ where: { country, userId: target.id } });
      return;
    case "move": {
      if (!Number.isInteger(seatIndex) || seatIndex === CS_AGENT_SEAT || !CS_SEAT_INDEXES.includes(seatIndex)) throw fail("VALIDATION_ERROR", "Choose a user seat.", 422);
      assertCsSeat(target, country, seatIndex);
      await ensureSeats(db, country);
      await db.$transaction(async (tx) => {
        const from = await tx.csRoomSeat.findFirst({ where: { occupantUserId: target.id, country }, select: { seatIndex: true } });
        if (!from) throw fail("CS_TARGET_NOT_SEATED", "This user is not on a seat.", 409);
        if (from.seatIndex === seatIndex) return;
        await tx.csRoomSeat.updateMany({ where: { occupantUserId: target.id }, data: { occupantUserId: null, occupiedAt: null } });
        const moved = await tx.csRoomSeat.updateMany({ where: { country, seatIndex, occupantUserId: null }, data: { occupantUserId: target.id, occupiedAt: now } });
        if (!moved.count) throw fail("CS_SEAT_TAKEN", "This seat is already taken.", 409);
      });
      return;
    }
    case "queue-remove":
      await db.csRoomQueue.deleteMany({ where: { userId: target.id, country } });
      return;
    case "remove":
      await clearSeat();
      await removePresence();
      return;
    case "ban": {
      if (!CS_BAN_MINUTES.includes(minutes)) throw fail("VALIDATION_ERROR", "Choose a ban length.", 422);
      const expiresAt = new Date(now.getTime() + minutes * 60_000);
      await db.csRoomBan.upsert({ where: { country_userId: { country, userId: target.id } }, create: { country, userId: target.id, bannedById: actor.id, expiresAt }, update: { bannedById: actor.id, expiresAt, createdAt: now } });
      await clearSeat();
      await removePresence();
      return;
    }
    default:
      throw fail("VALIDATION_ERROR", "Unknown action.", 422);
  }
}
