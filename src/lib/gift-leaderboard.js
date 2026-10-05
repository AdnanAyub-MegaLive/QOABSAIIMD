import { prisma } from "./prisma.js";
import { resolveUserPerks } from "./user-perks.js";

const emptyLeaderboard = () => ({ topGifters: [], topReceivers: [] });

export function leaderboardEntry(total, user, perks) {
  return {
    publicId: user.publicId,
    name: user.name,
    profileImage: user.profileImage ?? null,
    frameUrl: perks?.frameUrl ?? null,
    badgeUrl: perks?.badgeUrl ?? null,
    totalCoins: Number(total ?? 0n),
  };
}

export async function getRoomGiftLeaderboard(roomId, origin, db = prisma) {
  const normalizedRoomId = String(roomId ?? "").trim();
  if (!normalizedRoomId) return emptyLeaderboard();

  const [gifterTotals, receiverTotals] = await Promise.all([
    db.giftTransaction.groupBy({
      by: ["senderId"],
      where: { roomId: normalizedRoomId },
      _sum: { coinValue: true },
      orderBy: { _sum: { coinValue: "desc" } },
      take: 3,
    }),
    db.giftTransaction.groupBy({
      by: ["recipientUserId"],
      where: { roomId: normalizedRoomId, recipientUserId: { not: null } },
      _sum: { coinValue: true },
      orderBy: { _sum: { coinValue: "desc" } },
      take: 3,
    }),
  ]);

  const userIds = [
    ...new Set([
      ...gifterTotals.map((item) => item.senderId),
      ...receiverTotals.map((item) => item.recipientUserId).filter(Boolean),
    ]),
  ];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, publicId: true, name: true, profileImage: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const perks = await resolveUserPerks(users, origin, ["FRAMES", "BADGES"]);

  return {
    topGifters: gifterTotals
      .map((item) => {
        const user = usersById.get(item.senderId);
        return user
          ? leaderboardEntry(
              item._sum.coinValue,
              user,
              perks.get(user.publicId),
            )
          : null;
      })
      .filter(Boolean),
    topReceivers: receiverTotals
      .map((item) => {
        const user = usersById.get(item.recipientUserId);
        return user
          ? leaderboardEntry(
              item._sum.coinValue,
              user,
              perks.get(user.publicId),
            )
          : null;
      })
      .filter(Boolean),
  };
}

export function parseRoomGiftRankingQuery(searchParams) {
  const type = searchParams.get("type")?.trim() || "senders";
  if (!new Set(["senders", "receivers"]).has(type)) {
    const error = new Error("type must be senders or receivers.");
    error.code = "VALIDATION_ERROR";
    error.validationMessage = error.message;
    throw error;
  }
  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");
  const page = rawPage === null || rawPage === "" ? 1 : Number(rawPage);
  const requestedLimit = rawLimit === null || rawLimit === "" ? 20 : Number(rawLimit);
  if (!Number.isSafeInteger(page) || page < 1) {
    const error = new Error("page must be a positive whole number.");
    error.code = "VALIDATION_ERROR";
    error.validationMessage = error.message;
    throw error;
  }
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    const error = new Error("limit must be a positive whole number.");
    error.code = "VALIDATION_ERROR";
    error.validationMessage = error.message;
    throw error;
  }
  const limit = Math.min(requestedLimit, 50);
  return { type, page, limit, offset: (page - 1) * limit };
}

export async function getRoomGiftRanking(
  roomId,
  { type, offset = 0, limit = 20, origin },
) {
  const normalizedRoomId = String(roomId ?? "").trim();
  const groupField = type === "senders" ? "senderId" : "recipientUserId";
  const totals = await prisma.giftTransaction.groupBy({
    by: [groupField],
    where: {
      roomId: normalizedRoomId,
      ...(groupField === "recipientUserId"
        ? { recipientUserId: { not: null } }
        : {}),
    },
    _sum: { coinValue: true },
    orderBy: [
      { _sum: { coinValue: "desc" } },
      { [groupField]: "asc" },
    ],
    skip: offset,
    take: limit,
  });
  const userIds = totals.map((item) => item[groupField]).filter(Boolean);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, publicId: true, name: true, profileImage: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const perks = await resolveUserPerks(users, origin, ["FRAMES", "BADGES"]);
  return {
    hasMore: totals.length === limit,
    entries: totals
      .map((item, index) => {
        const user = usersById.get(item[groupField]);
        return user
          ? {
              rank: offset + index + 1,
              ...leaderboardEntry(
                item._sum.coinValue,
                user,
                perks.get(user.publicId),
              ),
            }
          : null;
      })
      .filter(Boolean),
  };
}

export function roomGiftHistoryLimit(value) {
  if (value === null || value === undefined || value === "") return 20;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
}

export function serializeRoomGiftTransaction(
  transaction,
  mediaUrl = null,
  perks = new Map(),
) {
  const recipient = transaction.recipientUser
    ? {
        publicId: transaction.recipientUser.publicId,
        name: transaction.recipientUser.name,
        profileImage: transaction.recipientUser.profileImage ?? null,
        frameUrl:
          perks.get(transaction.recipientUser.publicId)?.frameUrl ?? null,
      }
    : null;
  return {
    id: transaction.id,
    createdAt: transaction.createdAt.toISOString(),
    quantity: transaction.quantity,
    coins: transaction.coinValue.toString(),
    sender: {
      publicId: transaction.sender.publicId,
      name: transaction.sender.name,
      profileImage: transaction.sender.profileImage ?? null,
      frameUrl: perks.get(transaction.sender.publicId)?.frameUrl ?? null,
    },
    recipient,
    gift: {
      name: transaction.giftAsset?.name ?? transaction.giftName,
      mediaUrl,
    },
  };
}
