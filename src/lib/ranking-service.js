import { prisma } from "./prisma";
import { liveRoomScore, rankingPeriodStart, rankingScoreLabel, sortRankingEntries } from "./rankings";
import { reconcileExpiredSpecialIds } from "./special-id";
import { resolveUserPerks } from "./user-perks";

const walletLabels = {
  GIFT_SENT: "Gifts sent",
  GIFT_RECEIVED: "Gift earnings",
  TRANSFER_RECEIVED: "Transfers received",
  BONUS: "Bonuses",
  REFUND: "Refunds",
};

export async function calculateRankings({
  type,
  period,
  origin,
  offset = 0,
  limit = 20,
  viewerPublicId = null,
  includeDetails = false,
}) {
  const generatedAt = new Date();
  const periodStart = rankingPeriodStart(period, generatedAt);
  await reconcileExpiredSpecialIds();
  const roleFilter =
    type === "streamers"
      ? { appRoles: { has: "HOST" } }
      : type === "listeners"
        ? { NOT: { appRoles: { has: "HOST" } } }
        : {};
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      ...roleFilter,
      bans: {
        none: {
          target: "USER",
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: generatedAt } }],
        },
      },
    },
    select: {
      id: true,
      publicId: true,
      name: true,
      profileImage: true,
      isVerified: true,
      isOfficial: true,
      vipLevel: true,
      specialIds: {
        where: {
          status: "ACTIVE",
          revokedAt: null,
          startsAt: { lte: generatedAt },
          OR: [{ expiresAt: null }, { expiresAt: { gt: generatedAt } }],
        },
        select: { specialId: true },
        orderBy: { startsAt: "desc" },
        take: 1,
      },
    },
  });
  const userIds = users.map((user) => user.id);
  const scoreResult =
    type === "liveRooms"
      ? await roomScores(userIds, periodStart, generatedAt)
      : await walletScores(type, userIds, periodStart);
  const liveRooms = await prisma.audioRoom.findMany({
    where: { ownerId: { in: userIds }, status: "LIVE", isBlocked: false },
    select: { ownerId: true, roomId: true },
  });
  const liveRoomByUser = new Map(liveRooms.map((room) => [room.ownerId, room.roomId]));
  const perks = await resolveUserPerks(users, origin, ["FRAMES", "BADGES"]);
  const scoreLabel = rankingScoreLabel(type);
  const sorted = sortRankingEntries(
    users
      .map((user) => ({
        user,
        score: scoreResult.scores.get(user.id) ?? 0n,
        breakdown: scoreResult.breakdowns.get(user.id) ?? [],
      }))
      .filter((entry) => entry.score > 0n),
  ).map((entry, index) => ({ ...entry, rank: index + 1 }));
  const podium = sorted
    .slice(0, 3)
    .map((entry) => serializeEntry(entry, perks, liveRoomByUser, scoreLabel, includeDetails));
  const regular = sorted.slice(3 + offset, 3 + offset + limit);
  const viewerEntry = sorted.find((entry) => entry.user.publicId === viewerPublicId);
  return {
    type,
    period,
    generatedAt: generatedAt.toISOString(),
    podium,
    rankings: regular.map((entry) =>
      serializeEntry(entry, perks, liveRoomByUser, scoreLabel, includeDetails),
    ),
    viewerRank: viewerEntry
      ? { rank: viewerEntry.rank, score: viewerEntry.score.toString(), scoreLabel }
      : null,
    totalRanked: sorted.length,
    nextOffset: 3 + offset + regular.length < sorted.length ? offset + regular.length : null,
  };
}

async function walletScores(type, userIds, periodStart) {
  if (!userIds.length) return { scores: new Map(), breakdowns: new Map() };
  const typeFilter =
    type === "listeners"
      ? ["GIFT_SENT"]
      : type === "overall"
        ? ["GIFT_RECEIVED", "TRANSFER_RECEIVED", "BONUS", "REFUND"]
        : ["GIFT_RECEIVED"];
  const totals = await prisma.walletTransaction.groupBy({
    by: ["userId", "type"],
    where: {
      userId: { in: userIds },
      type: { in: typeFilter },
      direction: type === "listeners" ? "DEBIT" : "CREDIT",
      status: "COMPLETED",
      ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
    },
    _sum: { coins: true, diamonds: true },
    _count: { _all: true },
  });
  const scores = new Map();
  const breakdowns = new Map();
  for (const item of totals) {
    const value = (item._sum.coins ?? 0n) + (item._sum.diamonds ?? 0n);
    scores.set(item.userId, (scores.get(item.userId) ?? 0n) + value);
    const rows = breakdowns.get(item.userId) ?? [];
    rows.push({ label: walletLabels[item.type] ?? item.type, value: value.toString(), count: item._count._all });
    breakdowns.set(item.userId, rows);
  }
  return { scores, breakdowns };
}

async function roomScores(userIds, periodStart, generatedAt) {
  if (!userIds.length) return { scores: new Map(), breakdowns: new Map() };
  const rooms = await prisma.audioRoom.findMany({
    where: {
      ownerId: { in: userIds },
      ...(periodStart
        ? { OR: [{ startedAt: { gte: periodStart } }, { endedAt: { gte: periodStart } }, { status: "LIVE" }] }
        : {}),
    },
    select: { ownerId: true, roomId: true, startedAt: true, endedAt: true, participantCount: true },
  });
  const giftTotals = rooms.length
    ? await prisma.giftTransaction.groupBy({
        by: ["roomId"],
        where: {
          roomId: { in: rooms.map((room) => room.roomId) },
          ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
        },
        _sum: { coinValue: true },
      })
    : [];
  const giftsByRoom = new Map(giftTotals.map((item) => [item.roomId, item._sum.coinValue ?? 0n]));
  const components = new Map();
  for (const room of rooms) {
    const effectiveStart = periodStart && room.startedAt < periodStart ? periodStart : room.startedAt;
    const effectiveEnd = room.endedAt && room.endedAt < generatedAt ? room.endedAt : generatedAt;
    const liveMinutes = Math.max(0, Math.floor((effectiveEnd - effectiveStart) / 60000));
    const current = components.get(room.ownerId) ?? { gifts: 0n, minutes: 0, participants: 0, rooms: 0 };
    current.gifts += giftsByRoom.get(room.roomId) ?? 0n;
    current.minutes += liveMinutes;
    current.participants += room.participantCount;
    current.rooms += 1;
    components.set(room.ownerId, current);
  }
  const scores = new Map();
  const breakdowns = new Map();
  for (const [userId, item] of components) {
    scores.set(userId, liveRoomScore({ giftCoins: item.gifts, liveMinutes: item.minutes, participants: item.participants }));
    breakdowns.set(userId, [
      { label: "Room gift coins", value: item.gifts.toString() },
      { label: "Live minutes", value: String(item.minutes) },
      { label: "Participant points", value: String(item.participants * 100) },
      { label: "Rooms", value: String(item.rooms) },
    ]);
  }
  return { scores, breakdowns };
}

function serializeEntry(entry, perks, liveRoomByUser, scoreLabel, includeDetails) {
  const userPerks = perks.get(entry.user.publicId);
  const liveRoomId = liveRoomByUser.get(entry.user.id) ?? null;
  return {
    rank: entry.rank,
    publicId: entry.user.publicId,
    displayId: entry.user.specialIds[0]?.specialId ?? entry.user.publicId,
    fullName: entry.user.name,
    profileImage: entry.user.profileImage,
    frameUrl: userPerks?.frameUrl ?? null,
    badgeUrl: userPerks?.badgeUrl ?? null,
    isVerified: Boolean(entry.user.isVerified),
    isOfficial: Boolean(entry.user.isOfficial),
    vipLevel: entry.user.vipLevel,
    isLive: Boolean(liveRoomId),
    liveRoomId,
    score: entry.score.toString(),
    scoreLabel,
    ...(includeDetails ? { breakdown: entry.breakdown } : {}),
  };
}
