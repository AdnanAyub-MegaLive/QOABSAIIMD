import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { rankingHash } from "./room-ranking-contract.js";
import { resolveUserPerks } from "./user-perks.js";
import { perkMediaFields } from "./decoration-media.js";
import { activeSearchSpecialId } from "./user-search.js";
import { roomAccessCheck } from "./room-access-check.js";
import { giftHours, hourlyError, hourlyCacheAction, hourlyViewerPosition, orderHourlyScores, HOURLY_GIFT_CACHE_MS, HOURLY_GIFT_COALESCE_MS, HOURLY_GIFT_UNIT } from "./hourly-gift-ranking-contract.js";

const revisionKeys = ["__hourly_gifts__", ..."0123456789abcdef".split("").map(s => `__hourly_gifts__:${s}`)];
const activeUser = now => ({ status: "ACTIVE", deletedAt: null, bans: { none: { target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } });

export async function hourlySourceRevision(db) {
  const rows = await db.roomRankingRevision.findMany({ where: { id: { in: revisionKeys } }, select: { id: true, revision: true } });
  if (!rows.some(r => r.id === "__hourly_gifts__")) throw hourlyError("HOURLY_RANKINGS_UNAVAILABLE", "Hourly gift rankings require the latest migration.", 503);
  return rows.reduce((sum, r) => sum + r.revision, 0n).toString();
}

export function hourlyGiftScoreSql(hours) {
  return Prisma.sql`
    WITH candidates AS MATERIALIZED (
    SELECT CASE WHEN g."createdAt" >= ${hours.current.start}::timestamp THEN 'current' ELSE 'previous' END AS period,
      g."senderId" AS "userId", g."coinValue", r.data->>'source' AS funding
    FROM "GiftTransaction" g LEFT JOIN "GiftRecoverySnapshot" r ON r."giftId" = g.id
    WHERE g."createdAt" >= ${hours.previous.start}::timestamp AND g."createdAt" < ${hours.current.end}::timestamp
      AND g."coinValue" > 0 AND g."reversedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "GiftSettlement" s WHERE s."giftTransactionId" = g.id)
      AND NOT EXISTS (SELECT 1 FROM "AuditLog" a WHERE a."entityType" = 'GiftTransaction' AND a.action = 'BACKPACK_GIFT_SENT' AND a."entityId" = g.id)
    )
    SELECT period, "userId", SUM("coinValue")::text AS score, 'SCORE' AS kind
    FROM candidates WHERE funding = 'COINS' GROUP BY period, "userId"
    UNION ALL
    SELECT period, NULL::text AS "userId", COUNT(*)::text AS score, 'UNVERIFIED' AS kind
    FROM candidates WHERE funding IS NULL OR funding NOT IN ('COINS', 'BACKPACK', 'FREE') GROUP BY period`;
}

// Raw server-only totals are shared. No viewer-facing response is cached globally.
export async function hourlyScoreSnapshot(db, clock = () => new Date()) {
  return db.$transaction(async tx => {
    // Only ranking requests take this lock; no source rows or wallets are locked.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('hourly-gift-rankings', 0))`;
    const now = clock(), hours = giftHours(now);
    const revision = await hourlySourceRevision(tx);
    const cached = await tx.hourlyGiftRankingCache.findUnique({ where: { id: hours.hourId } });
    const action = hourlyCacheAction(cached, revision, now);
    if (action !== "REBUILD") return { ...cached, hours };
    const rows = await tx.$queryRaw(hourlyGiftScoreSql(hours));
    const generatedAt = clock();
    if (giftHours(generatedAt).hourId !== hours.hourId) throw hourlyError("HOUR_CHANGED", "The hour changed. Refresh the leaderboard.", 409);
    const data = Object.fromEntries(["current", "previous"].map(period => [period, rows.filter(r => r.period === period && r.kind === "SCORE").map(({ userId, score }) => ({ userId, score }))]));
    data.unverified = Object.fromEntries(["current", "previous"].map(period => [period, rows.find(r => r.period === period && r.kind === "UNVERIFIED")?.score ?? "0"]));
    const values = { data, sourceRevision: revision, generatedAt, expiresAt: new Date(Math.min(Date.parse(hours.current.end), generatedAt.getTime() + HOURLY_GIFT_CACHE_MS)) };
    await tx.$executeRaw`DELETE FROM "HourlyGiftRankingCache" WHERE id IN (SELECT id FROM "HourlyGiftRankingCache" WHERE "expiresAt" < ${now.toISOString()}::timestamp LIMIT 10 FOR UPDATE SKIP LOCKED)`;
    const saved = await tx.hourlyGiftRankingCache.upsert({ where: { id: hours.hourId }, create: { id: hours.hourId, ...values }, update: values });
    return { ...saved, hours };
  }, { timeout: 15000 });
}

async function visibleUsers(db, ids, viewerId, now) {
  const blocks = await db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true } });
  const blocked = new Set(blocks.map(b => b.blockerId === viewerId ? b.blockedId : b.blockerId));
  const allowed = new Set();
  // Bounded parameter lists even in a high-volume global hour.
  for (let i = 0; i < ids.length; i += 1000) {
    const users = await db.user.findMany({ where: { ...activeUser(now), id: { in: ids.slice(i, i + 1000).filter(id => !blocked.has(id)) } }, select: { id: true } });
    for (const user of users) allowed.add(user.id);
  }
  return allowed;
}

export async function accessibleHourlyRooms(db, rankedIds, viewerId, now) {
  const rooms = new Map();
  for (const userId of rankedIds) {
    const candidates = await db.audioRoomMember.findMany({ where: { userId, socketCount: { gt: 0 }, audioRoom: { status: "LIVE", isBlocked: false, owner: activeUser(now) } },
      include: { audioRoom: true }, orderBy: [{ lastSeenAt: "desc" }, { audioRoomId: "asc" }], take: 10 });
    for (const { audioRoom: room } of candidates) {
      const blocked = await db.userBlock.findFirst({ where: { OR: [{ blockerId: viewerId, blockedId: room.ownerId }, { blockerId: room.ownerId, blockedId: viewerId }] } });
      if (blocked) continue;
      const member = await db.audioRoomMember.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: viewerId } } });
      // Existing room membership proves password admission; never return the hash.
      const access = await roomAccessCheck(db, { ...room, passwordHash: member?.socketCount > 0 ? null : room.passwordHash }, viewerId, now);
      if (access.code) continue;
      rooms.set(userId, { roomId: room.roomId, title: room.title }); break;
    }
  }
  return rooms;
}

export async function getHourlyGiftRankings({ user, origin }, db = prisma, clock = () => new Date()) {
  const snapshot = await hourlyScoreSnapshot(db, clock), now = clock();
  const ids = [...new Set([user.id, ...snapshot.data.current.map(r => r.userId), ...snapshot.data.previous.map(r => r.userId)])];
  const allowed = await visibleUsers(db, ids, user.id, now);
  if (!allowed.has(user.id)) throw hourlyError("FORBIDDEN", "Your account cannot access rankings.", 403);
  const current = orderHourlyScores(snapshot.data.current, allowed), previous = orderHourlyScores(snapshot.data.previous, allowed);
  // Unknown funding can change every position/threshold. Do not label a partial
  // sum as an exact global rank, or turn unknown sending into zero.
  const currentAvailable = snapshot.data.unverified.current === "0", previousAvailable = snapshot.data.unverified.previous === "0";
  const top50 = currentAvailable ? current.slice(0, 50) : [], top3 = previousAvailable ? previous.slice(0, 3) : [];
  const position = currentAvailable ? hourlyViewerPosition(current, user.id) : { ranked: null, rank: null, sentCoins: null, unit: HOURLY_GIFT_UNIT, inTop50: null, additionalCoinsToTop50: null };
  const displayIds = [...new Set([user.id, ...top50.map(r => r.userId), ...top3.map(r => r.userId)])];
  const people = await db.user.findMany({ where: { ...activeUser(now), id: { in: displayIds } }, select: {
    id: true, publicId: true, name: true, profileImage: true,
    specialIds: { where: activeSearchSpecialId(now), select: { specialId: true }, orderBy: [{ startsAt: "desc" }, { id: "asc" }], take: 1 },
  } });
  const byId = new Map(people.map(p => [p.id, p]));
  const perks = await resolveUserPerks(people, origin, ["FRAMES", "BADGES"]);
  const rooms = await accessibleHourlyRooms(db, top3.map(r => r.userId), user.id, now);
  const identity = id => {
    const person = byId.get(id);
    if (!person) throw hourlyError("RANKING_CHANGED", "Visibility changed. Refresh the leaderboard.", 409);
    const artwork = perks.get(person.publicId);
    return { publicId: person.publicId, specialId: person.specialIds[0]?.specialId ?? null, name: person.name, profileImage: person.profileImage,
      frameUrl: artwork?.frameUrl ?? null, badgeUrl: artwork?.badgeUrl ?? null, ...perkMediaFields(artwork, ["frame", "badge"]) };
  };
  const entry = r => ({ ...identity(r.userId), rank: r.rank, score: r.score, unit: HOURLY_GIFT_UNIT });
  const viewer = { ...identity(user.id), ...position };
  const currentHour = { ...snapshot.hours.current, coverageStatus: currentAvailable ? "AVAILABLE" : "UNAVAILABLE", totalParticipants: currentAvailable ? current.length : null, totalSentCoins: currentAvailable ? current.reduce((sum, r) => sum + BigInt(r.score), 0n).toString() : null, entries: top50.map(entry) };
  const previousHour = { ...snapshot.hours.previous, coverageStatus: previousAvailable ? "AVAILABLE" : "UNAVAILABLE", totalParticipants: previousAvailable ? previous.length : null, entries: top3.map(r => ({ ...entry(r), liveRoom: rooms.get(r.userId) ?? null })) };
  let serverTime = clock();
  if (giftHours(serverTime).hourId !== snapshot.hours.hourId) throw hourlyError("HOUR_CHANGED", "The hour changed. Refresh the leaderboard.", 409);
  const check = await visibleUsers(db, ids, user.id, serverTime);
  if (check.size !== allowed.size || [...allowed].some(id => !check.has(id))) throw hourlyError("RANKING_CHANGED", "Visibility changed. Refresh the leaderboard.", 409);
  const stale = snapshot.sourceRevision !== await hourlySourceRevision(db);
  serverTime = clock();
  if (giftHours(serverTime).hourId !== snapshot.hours.hourId) throw hourlyError("HOUR_CHANGED", "The hour changed. Refresh the leaderboard.", 409);
  // Content revision excludes clocks and expiring URL signatures; media versions
  // and live-room availability remain part of it.
  const stableEntry = e => ({ ...e, frameUrl: e.frameMediaVersion ? undefined : e.frameUrl, badgeUrl: e.badgeMediaVersion ? undefined : e.badgeUrl, framePosterUrl: undefined, badgePosterUrl: undefined });
  const revision = rankingHash([snapshot.hours.hourId, user.publicId, current.map(r => [r.userId, r.score]), previous.map(r => [r.userId, r.score]),
    currentHour.entries.map(stableEntry), previousHour.entries.map(stableEntry), stableEntry(viewer), currentHour.coverageStatus, previousHour.coverageStatus]);
  return { scope: "GLOBAL_GIFT_SENDING", timezone: "UTC", hourId: snapshot.hours.hourId, nextResetAt: snapshot.hours.nextResetAt,
    serverTime: serverTime.toISOString(), generatedAt: snapshot.generatedAt.toISOString(), revision, status: !currentAvailable && !previousAvailable ? "UNAVAILABLE" : !currentAvailable || !previousAvailable ? "PARTIAL" : stale ? "STALE" : "AVAILABLE", stale,
    refreshAfterMs: stale ? Math.max(100, HOURLY_GIFT_COALESCE_MS - (serverTime.getTime() - snapshot.generatedAt.getTime())) : HOURLY_GIFT_COALESCE_MS,
    cacheScope: "ACCOUNT_AND_VISIBILITY", visibilityPolicy: "FILTER_THEN_RANK", unit: HOURLY_GIFT_UNIT,
    currentHour, previousHour, viewer, header: { hourId: snapshot.hours.hourId, revision, ...position },
    coverage: { supportedSurfaces: ["AUDIO_ROOM", "VIDEO_LIVE", "DIRECT_CHAT", "GROUP_CHAT", "DIRECT_GIFT"], source: "COMMITTED_GIFT_TRANSACTION_WITH_SETTLEMENT",
      inventoryAndFreeGifts: "EXCLUDED", legacyRecordsWithoutSettlement: "EXCLUDED", legacyMissingFundingProvenance: "EXCLUDED_UNVERIFIED_SPENDING", partialRefunds: "NOT_SUPPORTED_BY_CURRENT_REFUND_SERVICE", previousHourPolicy: "RECALCULATED_WITH_REVERSALS_AND_CURRENT_VISIBILITY" } };
}
