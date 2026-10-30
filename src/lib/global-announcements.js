import { Prisma } from "@prisma/client";
import { qualifiesForAnnouncement } from "./global-announcement-policy.js";

export const ANNOUNCEMENT_EVENT = "global:announcement";
const running = new WeakSet();
const rerun = new WeakSet();
const emitted = new Map();
const activeBan = now => ({ revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

// Reads only committed records, on an independent worker. No gift/wallet transaction
// awaits this code, and no locks are taken on financial or source records.
export function announcementCandidatesSql(since, now) {
  return Prisma.sql`
    WITH gifts AS (
      SELECT g.*, s.data, s."createdAt" AS confirmed
      FROM "GiftRecoverySnapshot" s JOIN "GiftTransaction" g ON g.id = s."giftId"
      WHERE s."createdAt" >= ${since} AND s."createdAt" <= ${now}
        AND g."reversedAt" IS NULL AND g."roomId" IS NOT NULL
        AND s.data->>'source' = 'COINS'
        AND EXISTS (SELECT 1 FROM "GiftSettlement" t WHERE t."giftTransactionId" = g.id)
    ), recent_rounds AS (
      SELECT DISTINCT "dayId", "roomId", slot, "userId" FROM "SharedGameEntry"
      WHERE "settledAt" >= ${since} AND "settledAt" <= ${now} AND input->>'currency' = 'COINS'
    ), rounds AS (
      SELECT e."dayId", e."roomId", e.slot, e."userId", MAX(e."settledAt") AS confirmed,
        SUM((e.result->>'payout')::numeric) - SUM(e.amount) AS profit,
        SUM(e.amount) AS wager, SUM((e.result->>'payout')::numeric) AS payout,
        array_agg(e.id ORDER BY e.id) AS ids
      FROM recent_rounds r JOIN "SharedGameEntry" e USING ("dayId", "roomId", slot, "userId")
      WHERE e.input->>'currency' = 'COINS'
      GROUP BY e."dayId", e."roomId", e.slot, e."userId"
      HAVING bool_and(e.status = 'SETTLED') AND MAX(e."resolveAt") <= ${now}
    ), candidates AS (
      SELECT 'BIG_GIFT:' || id AS id, 'BIG_GIFT' AS type, "senderId" AS "actorId", "roomId",
        "coinValue"::text AS amount, confirmed, ARRAY[id] AS "sourceIds",
        jsonb_build_object('giftName', "giftName", 'quantity', quantity, 'spentCoins', "coinValue"::text) AS details
      FROM gifts
      UNION ALL
      SELECT 'LUCKY_RETURN:' || id, 'LUCKY_RETURN', "senderId", "roomId", data->>'luckyCoins', confirmed, ARRAY[id],
        jsonb_build_object('giftName', "giftName", 'quantity', quantity, 'spentCoins', "coinValue"::text,
          'returnedCoins', data->>'luckyCoins', 'multiplierNumerator', data->>'luckyCoins', 'multiplierDenominator', "coinValue"::text)
      FROM gifts WHERE (data->>'luckyCoins')::numeric > 0
      UNION ALL
      SELECT 'GAME_WIN:' || md5(jsonb_build_array(r."dayId", r."roomId", r.slot, r."userId")::text),
        'GAME_WIN', r."userId", r."roomId", r.profit::text, r.confirmed, r.ids,
        jsonb_build_object('gameId', d."gameId", 'gameName', d.settings->>'name', 'wagerCoins', r.wager::text,
          'payoutCoins', r.payout::text, 'netProfitCoins', r.profit::text)
      FROM rounds r JOIN "SharedGameDay" d ON d.id = r."dayId" WHERE r.profit > 0
    ) SELECT * FROM candidates c WHERE NOT EXISTS (SELECT 1 FROM "GlobalAnnouncement" a WHERE a.id = c.id)
      ORDER BY confirmed, id LIMIT 100`;
}

export async function collectAnnouncements(db, now = new Date()) {
  return db.$transaction(async tx => {
    const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(2030140, 147) AS locked`;
    if (!lock.locked) return;
    const policy = await tx.globalAnnouncementPolicy.findUnique({ where: { id: "GLOBAL" } });
    if (!policy || !Object.values(policy.rules).some(rule => rule.enabled)) return;
    const since = new Date(Math.max(policy.updatedAt.getTime(), now.getTime() - policy.lifetimeSeconds * 1000));
    const candidates = await tx.$queryRaw(announcementCandidatesSql(since, now));
    const ignored = [];
    for (const c of candidates) {
      let payload = null;
      if (qualifiesForAnnouncement(c, policy)) {
        const recent = await tx.globalAnnouncement.findFirst({ where: {
          actorId: c.actorId, type: c.type, payload: { not: Prisma.DbNull },
          createdAt: { gt: new Date(now.getTime() - policy.cooldownSeconds * 1000) },
        }, select: { id: true } });
        if (!recent) payload = { type: c.type, amount: c.amount, unit: "COINS", details: c.details,
          policyRevision: policy.revision, occurredAt: c.confirmed.toISOString() };
      }
      // Record ignored candidates too: lowering thresholds never replays them.
      const data = { id: c.id, actorId: c.actorId, type: c.type,
        roomId: c.roomId, sourceIds: c.sourceIds, payload: payload ?? Prisma.DbNull,
        expiresAt: new Date(c.confirmed.getTime() + policy.lifetimeSeconds * 1000),
        deliveredAt: payload ? null : now };
      // Visible candidates stay sequential so cooldown checks observe this batch.
      // Suppressed receipts need no per-row round trip, but remain durable.
      if (payload) await tx.globalAnnouncement.create({data});
      else ignored.push(data);
    }
    if (ignored.length) await tx.globalAnnouncement.createMany({data:ignored});
    // Disposable presentation receipts only, never transaction/history tables.
    await tx.globalAnnouncement.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86400000) } } });
  }, { timeout: 5000, maxWait: 1000 });
}

export function isPublicAnnouncementRoom(room) {
  return Boolean(room && room.status === "LIVE" && room.privacyMode === "PUBLIC" && !room.passwordHash &&
    !room.isBlocked && !room.joiningDisabled && !room.endedAt && !room.paidEntryCoins);
}

async function announcementAudience(db, row, io, now) {
  const [room, actor, policy] = await Promise.all([
    db.audioRoom.findUnique({ where: { roomId: row.roomId }, select:{id:true,roomId:true,ownerId:true,status:true,privacyMode:true,passwordHash:true,isBlocked:true,joiningDisabled:true,endedAt:true,paidEntryCoins:true} }),
    db.user.findUnique({ where: { id: row.actorId }, select: { id: true, publicId: true, name: true, status: true, deletedAt: true } }),
    db.globalAnnouncementPolicy.findUnique({ where: { id: "GLOBAL" } }),
  ]);
  if (!isPublicAnnouncementRoom(room) || !actor || actor.status !== "ACTIVE" || actor.deletedAt ||
      !policy?.rules[row.type]?.enabled || policy.revision !== row.payload.policyRevision) return null;
  // Recheck reversal/cancellation immediately before publication.
  if (row.type === "GAME_WIN") {
    const count = await db.sharedGameEntry.count({ where: { id: { in: row.sourceIds }, status: "SETTLED", input: { path: ["currency"], equals: "COINS" } } });
    if (count !== row.sourceIds.length) return null;
  } else if (await db.giftTransaction.count({ where: { id: { in: row.sourceIds }, reversedAt: null } }) !== row.sourceIds.length) return null;
  const sockets = await io.fetchSockets();
  const ids = [...new Set(sockets.map(s => s.data.internalUserId).filter(Boolean))];
  const subjects = [...new Set([row.actorId, room.ownerId])];
  const [users, blocks, bans, roomBans] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...ids, ...subjects] }, status: "ACTIVE", deletedAt: null }, select: { id: true, sessionVersion: true, companyBdCountry: true } }),
    db.userBlock.findMany({ where: { OR: [{ blockerId: { in: subjects } }, { blockedId: { in: subjects } }] }, select: { blockerId: true, blockedId: true } }),
    db.ban.findMany({ where: { target: "USER", userId: { in: [...ids, ...subjects] }, ...activeBan(now) }, select: { userId: true } }),
    db.audioRoomBan.findMany({ where: { audioRoomId: room.id, ...activeBan(now) }, select: { userId: true } }),
  ]);
  const banned = new Set(bans.map(b => b.userId));
  const allowed = new Map(users.filter(u => !u.companyBdCountry && !banned.has(u.id)).map(u => [u.id, u]));
  if (subjects.some(id => !allowed.has(id))) return null;
  const hidden = new Set(roomBans.map(b => b.userId));
  for (const b of blocks) {
    if (subjects.includes(b.blockerId)) hidden.add(b.blockedId);
    if (subjects.includes(b.blockedId)) hidden.add(b.blockerId);
  }
  return { actor: { publicId: actor.publicId, name: actor.name }, roomId: room.roomId,
    sockets: sockets.filter(s => allowed.get(s.data.internalUserId)?.sessionVersion === s.data.sessionVersion &&
      allowed.has(s.data.internalUserId) && !hidden.has(s.data.internalUserId)) };
}

export async function dispatchAnnouncements(db, io, now = new Date()) {
  const failures = [];
  for (const [id, until] of emitted) if (until <= now.getTime()) emitted.delete(id);
  const rows = await db.globalAnnouncement.findMany({ where: { deliveredAt: null, expiresAt: { gt: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 10 });
  // The query bounds concurrency to ten; one slow audience does not stall peers.
  {
    const results = await Promise.allSettled(rows.map(async row => {
    const leaseUntil = new Date(now.getTime() + 30000);
    const claim = await db.globalAnnouncement.updateMany({ where: { id: row.id, deliveredAt: null,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil } });
    if (!claim.count) return;
    const audience = await announcementAudience(db, row, io, now);
    if (audience && row.expiresAt > new Date() && !emitted.has(row.id)) {
      const data = { ...row.payload, announcementId: row.id, actor: audience.actor, roomId: audience.roomId,
        expiresAt: row.expiresAt.toISOString(), serverTime: new Date().toISOString() };
      // Per authenticated socket, not io.emit: do not leak blocked identities.
      for (const socket of audience.sockets) socket.emit(ANNOUNCEMENT_EVENT, { success: true, data });
      emitted.set(row.id, row.expiresAt.getTime());
    }
    await db.globalAnnouncement.updateMany({ where: { id: row.id, leaseUntil }, data: { deliveredAt: new Date() } });
    }));
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
  }
  if (failures.length) throw failures[0]; // Finish unrelated candidates before reporting failure.
}

export async function runGlobalAnnouncements(db, io) {
  if (!io) return;
  if (running.has(db)) { rerun.add(db); return; }
  running.add(db);
  try { do { rerun.delete(db); await collectAnnouncements(db); await dispatchAnnouncements(db, io); } while (rerun.has(db)); }
  finally { running.delete(db); }
}
