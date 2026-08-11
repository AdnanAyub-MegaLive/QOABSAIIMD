import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import {
  decodeRankingCursor,
  encodeRankingCursor,
  liveRoomScore,
  rankingPeriodStart,
  rankingPeriods,
  rankingScoreLabel,
  rankingTypes,
  rankingValidationError,
  sortRankingEntries,
} from "@/lib/rankings";
import { reconcileExpiredSpecialIds } from "@/lib/special-id";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    const viewer = await requireMobileUser(request);
    const url = new URL(request.url);
    const type = String(url.searchParams.get("type") ?? "overall");
    const period = String(url.searchParams.get("period") ?? "week");
    if (!rankingTypes.has(type)) throw rankingValidationError("type is invalid.");
    if (!rankingPeriods.has(period)) throw rankingValidationError("period is invalid.");
    const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
      throw rankingValidationError("limit must be a positive integer.");
    const limit = Math.min(50, requestedLimit);
    const offset = decodeRankingCursor(url.searchParams.get("cursor"));
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
            OR: [{ expiresAt: null }, { expiresAt: { gt: generatedAt } }],
          },
          select: { specialId: true },
          orderBy: { startsAt: "desc" },
          take: 1,
        },
      },
    });
    const userIds = users.map((user) => user.id);
    const scores =
      type === "liveRooms"
        ? await roomScores(userIds, periodStart, generatedAt)
        : await walletScores(type, userIds, periodStart);
    const liveRooms = await prisma.audioRoom.findMany({
      where: { ownerId: { in: userIds }, status: "LIVE", isBlocked: false },
      select: { ownerId: true, roomId: true },
    });
    const liveRoomByUser = new Map(liveRooms.map((room) => [room.ownerId, room.roomId]));
    const perks = await resolveUserPerks(users, requestOrigin(request), ["FRAMES", "BADGES"]);
    const scoreLabel = rankingScoreLabel(type);
    const sorted = sortRankingEntries(
      users
        .map((user) => ({ user, score: scores.get(user.id) ?? 0n }))
        .filter((entry) => entry.score > 0n),
    ).map((entry, index) => ({ ...entry, rank: index + 1 }));
    const podium = sorted.slice(0, 3).map((entry) => serializeEntry(entry, perks, liveRoomByUser, scoreLabel));
    const regular = sorted.slice(3 + offset, 3 + offset + limit);
    const nextOffset = offset + regular.length;
    const viewerEntry = sorted.find((entry) => entry.user.publicId === viewer.publicId);

    return mobileJson({
      success: true,
      data: {
        type,
        period,
        generatedAt: generatedAt.toISOString(),
        podium,
        rankings: regular.map((entry) => serializeEntry(entry, perks, liveRoomByUser, scoreLabel)),
        viewerRank: viewerEntry
          ? { rank: viewerEntry.rank, score: viewerEntry.score.toString(), scoreLabel }
          : null,
        nextCursor:
          3 + nextOffset < sorted.length ? encodeRankingCursor(nextOffset) : null,
      },
    });
  } catch (error) {
    console.error("Mobile rankings failed", error);
    return mobileApiError(error, "RANKINGS_FAILED");
  }
}

async function walletScores(type, userIds, periodStart) {
  if (!userIds.length) return new Map();
  const typeFilter =
    type === "listeners"
      ? ["GIFT_SENT"]
      : type === "overall"
        ? ["GIFT_RECEIVED", "TRANSFER_RECEIVED", "BONUS", "REFUND"]
        : ["GIFT_RECEIVED"];
  const direction = type === "listeners" ? "DEBIT" : "CREDIT";
  const totals = await prisma.walletTransaction.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
      type: { in: typeFilter },
      direction,
      status: "COMPLETED",
      ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
    },
    _sum: { coins: true, diamonds: true },
  });
  return new Map(
    totals.map((item) => [
      item.userId,
      (item._sum.coins ?? 0n) + (item._sum.diamonds ?? 0n),
    ]),
  );
}

async function roomScores(userIds, periodStart, generatedAt) {
  if (!userIds.length) return new Map();
  const rooms = await prisma.audioRoom.findMany({
    where: {
      ownerId: { in: userIds },
      ...(periodStart
        ? {
            OR: [
              { startedAt: { gte: periodStart } },
              { endedAt: { gte: periodStart } },
              { status: "LIVE" },
            ],
          }
        : {}),
    },
    select: {
      ownerId: true,
      roomId: true,
      startedAt: true,
      endedAt: true,
      participantCount: true,
    },
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
  const result = new Map();
  for (const room of rooms) {
    const effectiveStart = periodStart && room.startedAt < periodStart ? periodStart : room.startedAt;
    const effectiveEnd = room.endedAt && room.endedAt < generatedAt ? room.endedAt : generatedAt;
    const liveMinutes = Math.max(0, Math.floor((effectiveEnd - effectiveStart) / 60000));
    const score = liveRoomScore({
      giftCoins: giftsByRoom.get(room.roomId) ?? 0n,
      liveMinutes,
      participants: room.participantCount,
    });
    result.set(room.ownerId, (result.get(room.ownerId) ?? 0n) + score);
  }
  return result;
}

function serializeEntry(entry, perks, liveRoomByUser, scoreLabel) {
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
  };
}
