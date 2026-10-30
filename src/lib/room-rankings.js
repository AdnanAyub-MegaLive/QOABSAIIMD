import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { resolveUserPerks } from "./user-perks.js";
import { decorationMedia, perkMediaFields } from "./decoration-media.js";
import { activeSearchSpecialId } from "./user-search.js";
import { gameIconArtwork } from "./game-control/icon-artwork.js";
import { rankingError, rankingHash, rankRoomScores, roomRankingPeriod } from "./room-ranking-contract.js";

const units = { WEALTH: "COINS_SPENT", CHARM: "GIFT_COINS_RECEIVED", GAMES: "COINS_WAGERED" };
const snapshotLifetimeMs = 120000;

export async function requireRankingRoom(db, roomId, user, now = new Date()) {
  const room = await db.audioRoom.findUnique({ where: { roomId } });
  if (!room) throw rankingError("ROOM_UNAVAILABLE", "Room not found.", 404);
  if (room.isBlocked || !["LIVE", "IDLE"].includes(room.status)) throw rankingError("ROOM_UNAVAILABLE", "Room is unavailable.", 403);
  const ban = await db.audioRoomBan.findFirst({ where: { audioRoomId: room.id, userId: user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
  const accountBan = await db.ban.findFirst({ where: { userId: user.id, target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
  const blocked = await db.userBlock.findFirst({ where: { OR: [{ blockerId: room.ownerId, blockedId: user.id }, { blockerId: user.id, blockedId: room.ownerId }] } });
  if (ban || accountBan || blocked) throw rankingError("ROOM_ACCESS_DENIED", "You cannot access this room.", 403);
  if (room.ownerId !== user.id) {
    const member = await db.audioRoomMember.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: user.id } } });
    if (!member || member.socketCount <= 0 || room.status !== "LIVE") throw rankingError("JOIN_ROOM_FIRST", "Join the room before viewing rankings.", 403);
  }
  return room;
}

async function visibility(db, viewerId, now) {
  const blocks = await db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true } });
  // Including the active set in the key handles timed ban expiry without writes.
  const bans = await db.ban.findMany({ where: { target: "USER", userId: { not: null }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { userId: true } });
  const hidden = [...new Set([...bans.map(b => b.userId), ...blocks.map(b => b.blockerId === viewerId ? b.blockedId : b.blockerId)])].sort();
  return { hidden, hash: rankingHash(hidden) };
}

async function sourceRevision(db, roomId) {
  const keys = [roomId, ..."0123456789abcdef".split("").map(shard => `${roomId}:${shard}`)];
  const rows = await db.roomRankingRevision.findMany({ where: { id: { in: [...keys, "__visibility__", "__coverage__"] } } });
  const byId = new Map(rows.map(r => [r.id, r]));
  if (!byId.has("__coverage__")) throw rankingError("RANKINGS_UNAVAILABLE", "Room ranking migration is not installed.", 503);
  const roomRevision = keys.reduce((total, key) => total + (byId.get(key)?.revision ?? 0n), 0n);
  return { revision: `${roomRevision}:${byId.get("__visibility__")?.revision ?? 0n}`, gamesSince: byId.get("__coverage__").createdAt.toISOString() };
}

export function roomScoreSql(roomId, bounds, hidden) {
  const excluded = hidden.length ? Prisma.sql`AND u.id NOT IN (${Prisma.join(hidden)})` : Prisma.empty;
  return Prisma.sql`
    WITH gifts AS MATERIALIZED (
      SELECT g.* FROM "GiftTransaction" g
      WHERE g."roomId" = ${roomId} AND g."createdAt" >= ${bounds.start}::timestamp
        AND g."createdAt" < ${bounds.end}::timestamp AND g."reversedAt" IS NULL
        AND EXISTS (SELECT 1 FROM "GiftSettlement" s WHERE s."giftTransactionId" = g.id)
    ), contributions AS (
      SELECT 'WEALTH' AS category, g."senderId" AS "userId", NULL::text AS "gameId", g."coinValue" AS score
      FROM gifts g
      -- Inventory gifts have a face value but do not spend Coins at send time.
      WHERE NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."entityType" = 'GiftTransaction' AND a.action = 'BACKPACK_GIFT_SENT' AND a."entityId" = g.id)
        AND NOT EXISTS (SELECT 1 FROM "GiftRecoverySnapshot" s WHERE s."giftId" = g.id AND s.data->>'source' = 'BACKPACK')
      UNION ALL
      SELECT 'CHARM', g."recipientUserId", NULL::text, g."coinValue" FROM gifts g WHERE g."recipientUserId" IS NOT NULL
      UNION ALL
      SELECT 'GAMES', e."userId", d."gameId", e.amount
      FROM "SharedGameEntry" e JOIN "SharedGameDay" d ON d.id = e."dayId"
      WHERE e."roomId" = ${roomId} AND e.status = 'SETTLED' AND e.input->>'currency' = 'COINS'
        AND e."settledAt" >= ${bounds.start}::timestamp AND e."settledAt" < ${bounds.end}::timestamp
    )
    SELECT c.category, c."userId", c."gameId", SUM(c.score)::text AS score
    FROM contributions c JOIN "User" u ON u.id = c."userId"
    WHERE u.status = 'ACTIVE' AND u."deletedAt" IS NULL ${excluded}
    GROUP BY c.category, c."userId", c."gameId"`;
}

async function loadSnapshot(db, roomId, viewerId, query, now) {
  const bounds = roomRankingPeriod(query.period, now);
  return db.$transaction(async tx => {
    // Serialize calculations, not gifting: no wallet/source rows are locked.
    const lockKey = rankingHash([roomId, bounds.start, query.period]);
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const context = await visibility(tx, viewerId, now);
    const source = await sourceRevision(tx, roomId);
    const identity = rankingHash([roomId, bounds, context.hash]);
    const cacheKey = rankingHash([identity, source.revision]);
    if (query.snapshotId) {
      const saved = await tx.roomRankingSnapshot.findUnique({ where: { id: query.snapshotId } });
      if (!saved || saved.expiresAt <= now || saved.cacheKey !== cacheKey) throw rankingError("SNAPSHOT_EXPIRED", "Ranking changed or expired. Reload page 1.", 409);
      return saved;
    }
    const cached = await tx.roomRankingSnapshot.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > now) return cached;
    const raw = await tx.$queryRaw(roomScoreSql(roomId, bounds, context.hidden));
    const after = await sourceRevision(tx, roomId);
    if (after.revision !== source.revision) throw rankingError("RANKING_CHANGED", "Room activity changed. Retry the ranking request.", 409);
    const categories = {};
    for (const category of Object.keys(units)) {
      const entries = rankRoomScores(raw.filter(r => r.category === category));
      categories[category] = { unit: units[category], entries, total: entries.reduce((n, e) => n + BigInt(e.score), 0n).toString() };
    }
    const data = { roomId, ...bounds, generatedAt: now.toISOString(), revision: rankingHash([identity, categories]), categories,
      coverage: { gamesSince: source.gamesSince, gameSources: ["SHARED_GAME_ENTRY"], externalProviders: "UNAVAILABLE", legacyGames: "EXCLUDED_MISSING_SETTLEMENT_TIME", partialGiftRefunds: "NOT_SUPPORTED_BY_CURRENT_REFUND_SERVICE", giftSource: "COMMITTED_GIFT_TRANSACTION_WITH_SETTLEMENT", wealthExcludesInventoryGifts: true } };
    // Only disposable cache data is pruned; financial/source records are untouched.
    await tx.$executeRaw`DELETE FROM "RoomRankingSnapshot" WHERE id IN (SELECT id FROM "RoomRankingSnapshot" WHERE "expiresAt" <= ${now.toISOString()}::timestamp LIMIT 100 FOR UPDATE SKIP LOCKED)`;
    return tx.roomRankingSnapshot.upsert({ where: { cacheKey }, create: { id: randomUUID(), cacheKey, data, expiresAt: new Date(Math.min(now.getTime() + snapshotLifetimeMs, Date.parse(bounds.end))) }, update: { id: randomUUID(), data, createdAt: now, expiresAt: new Date(Math.min(now.getTime() + snapshotLifetimeMs, Date.parse(bounds.end))) } });
  }, { timeout: 15000 });
}

async function gameMetadata(db, ids, origin) {
  const rows = ids.length ? await db.gameDefinition.findMany({ where: { id: { in: ids } }, select: { id: true, settings: true, revision: true } }) : [];
  const assetIds = rows.map(r => r.settings.iconAssetId).filter(Boolean);
  const assets = assetIds.length ? await db.uploadAsset.findMany({ where: { publicId: { in: assetIds } }, omit: { fileData: true, posterFileData: true } }) : [];
  const byId = new Map(assets.map(a => [a.publicId, a]));
  return new Map(rows.map(row => {
    const asset = byId.get(row.settings.iconAssetId);
    const bundled = gameIconArtwork[row.settings.engine];
    return [row.id, { gameId: row.id, name: row.settings.name, artwork: asset ? decorationMedia(asset, origin) : bundled ? { url: new URL(bundled, origin).href, mimeType: "image/webp", mediaVersion: bundled.split("/").at(-1) } : null }];
  }));
}

export async function getRoomRankings({ roomId, user, query, origin }, db = prisma, now = new Date()) {
  await requireRankingRoom(db, roomId, user, now);
  let snapshot;
  for (let attempt = 0; ; attempt++) {
    try { snapshot = await loadSnapshot(db, roomId, user.id, query, now); break; }
    catch (e) { if (e.code !== "RANKING_CHANGED" || attempt >= 2) throw e; }
  }
  const data = snapshot.data, category = data.categories[query.category];
  const offset = (query.page - 1) * query.limit;
  const pageEntries = category.entries.slice(offset, offset + query.limit);
  const mine = category.entries.find(e => e.userId === user.id);
  const ids = [...new Set([...pageEntries.map(e => e.userId), ...(mine ? [mine.userId] : [])])];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids }, status: "ACTIVE", deletedAt: null }, select: {
    id: true, publicId: true, name: true, profileImage: true,
    specialIds: { where: activeSearchSpecialId(now), select: { specialId: true }, orderBy: [{ startsAt: "desc" }, { id: "asc" }], take: 1 },
  } }) : [];
  const byId = new Map(users.map(u => [u.id, u]));
  const perks = await resolveUserPerks(users, origin, ["FRAMES", "BADGES"]);
  const gameIds = [...new Set([...pageEntries, ...(mine ? [mine] : [])].flatMap(e => e.games.map(g => g.gameId)))];
  const games = await gameMetadata(db, gameIds, origin);
  const present = entry => {
    const u = byId.get(entry.userId);
    if (!u) throw rankingError("SNAPSHOT_EXPIRED", "User visibility changed. Reload page 1.", 409);
    const artwork = perks.get(u.publicId);
    return { rank: entry.rank, score: entry.score, unit: category.unit, publicId: u.publicId, specialId: u.specialIds[0]?.specialId ?? null, name: u.name, profileImage: u.profileImage,
      frameUrl: artwork?.frameUrl ?? null, badgeUrl: artwork?.badgeUrl ?? null, ...perkMediaFields(artwork, ["frame", "badge"]),
      games: entry.games.map(g => ({ ...g, ...(games.get(g.gameId) ?? { name: null, artwork: null }) })) };
  };
  // A block, ban or deletion during rendering must not leak the old snapshot.
  const latest = await sourceRevision(db, roomId);
  const currentVisibility = await visibility(db, user.id, new Date());
  if (snapshot.cacheKey !== rankingHash([rankingHash([roomId, roomRankingPeriod(query.period, new Date()), currentVisibility.hash]), latest.revision])) throw rankingError("SNAPSHOT_EXPIRED", "Ranking changed. Reload page 1.", 409);
  await requireRankingRoom(db, roomId, user);
  const gamesPartial = Date.parse(data.start) < Date.parse(data.coverage.gamesSince);
  const counters = Object.fromEntries(Object.entries(data.categories).map(([key, value]) => [key, { category: key, period: data.period, total: value.total, unit: value.unit, status: key === "GAMES" && gamesPartial ? "PARTIAL" : "AVAILABLE", totalParticipants: value.entries.length }]));
  return { roomId, category: query.category, period: data.period, timezone: data.timezone, start: data.start, end: data.end, nextResetAt: data.nextResetAt,
    generatedAt: data.generatedAt, checkedAt: new Date().toISOString(), revision: data.revision, snapshotId: snapshot.id, snapshotExpiresAt: snapshot.expiresAt.toISOString(), stale: false,
    coverage: data.coverage, status: counters[query.category].status, total: category.total, unit: category.unit, counters,
    page: query.page, limit: query.limit, totalParticipants: category.entries.length, hasMore: offset + query.limit < category.entries.length,
    entries: pageEntries.map(present), viewer: mine ? { ranked: true, ...present(mine) } : { ranked: false, rank: null, score: "0", unit: category.unit } };
}
