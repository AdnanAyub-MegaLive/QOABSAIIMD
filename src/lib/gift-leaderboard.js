import { prisma } from "./prisma.js";

const emptyLeaderboard = () => ({ topGifters: [], topReceivers: [] });

function leaderboardEntry(total, user) {
  return {
    publicId: user.publicId,
    name: user.name,
    profileImage: user.profileImage ?? null,
    totalCoins: Number(total ?? 0n),
  };
}

export async function getRoomGiftLeaderboard(roomId) {
  const normalizedRoomId = String(roomId ?? "").trim();
  if (!normalizedRoomId) return emptyLeaderboard();

  const [gifterTotals, receiverTotals] = await Promise.all([
    prisma.giftTransaction.groupBy({
      by: ["senderId"],
      where: { roomId: normalizedRoomId },
      _sum: { coinValue: true },
      orderBy: { _sum: { coinValue: "desc" } },
      take: 3,
    }),
    prisma.giftTransaction.groupBy({
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
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, deletedAt: null },
        select: { id: true, publicId: true, name: true, profileImage: true },
      })
    : [];
  const usersById = new Map(users.map((user) => [user.id, user]));

  return {
    topGifters: gifterTotals
      .map((item) => {
        const user = usersById.get(item.senderId);
        return user ? leaderboardEntry(item._sum.coinValue, user) : null;
      })
      .filter(Boolean),
    topReceivers: receiverTotals
      .map((item) => {
        const user = usersById.get(item.recipientUserId);
        return user ? leaderboardEntry(item._sum.coinValue, user) : null;
      })
      .filter(Boolean),
  };
}

export function roomGiftHistoryLimit(value) {
  if (value === null || value === undefined || value === "") return 20;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
}

export function serializeRoomGiftTransaction(transaction, mediaUrl = null) {
  const recipient = transaction.recipientUser
    ? {
        publicId: transaction.recipientUser.publicId,
        name: transaction.recipientUser.name,
        profileImage: transaction.recipientUser.profileImage ?? null,
      }
    : transaction.talent
      ? {
          publicId: transaction.talent.publicId,
          name: transaction.talent.displayName,
          profileImage: transaction.talent.profileImage ?? null,
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
    },
    recipient,
    gift: {
      name: transaction.giftAsset?.name ?? transaction.giftName,
      mediaUrl,
    },
  };
}
