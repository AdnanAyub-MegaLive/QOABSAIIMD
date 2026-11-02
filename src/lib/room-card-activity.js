import { Prisma } from '@prisma/client';

// One statement gives every card the same snapshot, including gifts committed
// before the background totals worker folds them. The worker updates the total
// and marks deltas processed atomically, so a delta is never counted twice.
export async function roomCardActivity(db, roomIds) {
  const ids = [...new Set(roomIds)];
  if (!ids.length) return new Map();
  const rows = await db.$queryRaw(Prisma.sql`
    WITH rooms AS (
      SELECT id, "roomId" FROM "AudioRoom"
      WHERE "roomId" IN (${Prisma.join(ids)})
    ), pending AS (
      SELECT d."roomId", sum(d.coins) AS coins
      FROM "RoomGiftDelta" d JOIN rooms r ON r."roomId" = d."roomId"
      WHERE d."processedAt" IS NULL GROUP BY d."roomId"
    ), envelopes AS (
      SELECT e."audioRoomId", count(*) AS count
      FROM "RedEnvelope" e JOIN rooms r ON r.id = e."audioRoomId"
      WHERE e.status = 'ACTIVE' AND e."claimableAt" <= CURRENT_TIMESTAMP
        AND e."expiresAt" > CURRENT_TIMESTAMP
        AND e."remainingShares" > 0 AND e."remainingCoins" > 0
      GROUP BY e."audioRoomId"
    )
    SELECT r."roomId",
      (COALESCE(t.coins, 0) + COALESCE(p.coins, 0))::text AS "giftTotalCoins",
      COALESCE(e.count, 0)::integer AS "activeRedEnvelopeCount"
    FROM rooms r
    LEFT JOIN "RoomGiftTotal" t ON t."roomId" = r."roomId"
    LEFT JOIN pending p ON p."roomId" = r."roomId"
    LEFT JOIN envelopes e ON e."audioRoomId" = r.id
  `);
  return new Map(rows.map(({ roomId, ...activity }) => [roomId, activity]));
}

export function roomCardActivityDto(activity, roomId) {
  return activity.get(roomId) ?? { giftTotalCoins: '0', activeRedEnvelopeCount: 0 };
}
