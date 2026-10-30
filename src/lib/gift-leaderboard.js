import { Prisma } from "@prisma/client";
import { perkMediaFields } from "./decoration-media.js";
import { prisma } from "./prisma.js";
import { resolveUserPerks } from "./user-perks.js";

async function roomGiftTotals(db, roomId, groupField, take, skip = 0) {
  const field = groupField === "senderId" ? Prisma.sql`g."senderId"` : Prisma.sql`g."recipientUserId"`;
  const now = new Date();
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT ${field} AS "userId", SUM(g."coinValue") AS score
    FROM "GiftTransaction" g JOIN "User" u ON u.id=${field}
    LEFT JOIN "VipMembership" v ON v."userId"=u.id AND v."revokedAt" IS NULL AND v."startsAt"<=${now} AND v."expiresAt">${now}
    LEFT JOIN "VipTier" t ON t.id=v."tierId" AND t.active=true
    WHERE g."roomId"=${roomId} AND g."reversedAt" IS NULL
    GROUP BY ${field},u."publicId",t.level,t.privileges
    ORDER BY score DESC, CASE WHEN 'RANKING_PRIORITY'=ANY(t.privileges) THEN t.level ELSE 0 END DESC,u."publicId" ASC
    LIMIT ${take} OFFSET ${skip}`);
  return rows.map(row=>({[groupField]:row.userId,_sum:{coinValue:row.score}}));
}

const emptyLeaderboard = () => ({ topGifters: [], topReceivers: [] });

export function leaderboardEntry(total, user, perks) {
  return {
    publicId: user.publicId,
    name: user.name,
    profileImage: user.profileImage ?? null,
    ...perkMediaFields(perks),
    frameUrl: perks?.frameUrl ?? null,
    badgeUrl: perks?.badgeUrl ?? null,
    totalCoins: Number(total ?? 0n),
  };
}

export async function getRoomGiftLeaderboard(roomId, origin, db = prisma) {
  const normalizedRoomId = String(roomId ?? "").trim();
  if (!normalizedRoomId) return emptyLeaderboard();

  const [gifterTotals, receiverTotals] = await Promise.all([
    roomGiftTotals(db, normalizedRoomId, "senderId", 3),
    roomGiftTotals(db, normalizedRoomId, "recipientUserId", 3),
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
  const totals = await roomGiftTotals(prisma, normalizedRoomId, groupField, limit, offset);
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
