import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function roomCardStats(rooms, db = prisma, now = new Date()) {
  if (!rooms.length) return new Map();
  const [totals, envelopes] = await Promise.all([
    db.$queryRaw(Prisma.sql`SELECT "roomId", SUM(coins)::bigint AS coins FROM (
      SELECT "roomId", coins FROM "RoomGiftTotal" WHERE "roomId" IN (${Prisma.join(rooms.map(room => room.roomId))})
      UNION ALL
      SELECT "roomId", coins FROM "RoomGiftDelta" WHERE "processedAt" IS NULL AND "roomId" IN (${Prisma.join(rooms.map(room => room.roomId))})
    ) totals GROUP BY "roomId"`),
    db.redEnvelope.groupBy({
      by: ["audioRoomId"],
      where: { audioRoomId: { in: rooms.map(room => room.id) }, status: "ACTIVE", remainingShares: { gt: 0 }, expiresAt: { gt: now } },
      _count: { _all: true },
    }),
  ]);
  const coins = new Map(totals.map(row => [row.roomId, row.coins]));
  const active = new Map(envelopes.map(row => [row.audioRoomId, row._count._all]));
  return new Map(rooms.map(room => [room.roomId, {
    giftTotalCoins: String(coins.get(room.roomId) ?? 0n),
    activeRedEnvelopeCount: active.get(room.id) ?? 0,
  }]));
}
