import { Prisma } from "@prisma/client";

// Provider debits are final committed coin spends, including losing rounds.
// Tulasi sends payouts only to winners, so requiring a payout would omit losses.
// Use the server ledger time, never a provider-supplied timestamp, for rankings.
export function tulasiWagersSql(start, end, roomId = null) {
  return Prisma.sql`SELECT w."userId", 'tulasi:' || (w.metadata->>'gameId') AS "gameId", w.coins AS amount
    FROM "WalletTransaction" w
    WHERE w.metadata->>'provider' = 'TULASI' AND w.type = 'GAME_WAGER'
      AND w.status = 'COMPLETED' AND w.direction = 'DEBIT' AND w.coins > 0
      AND w."referenceId" LIKE 'tulasi:%' AND NULLIF(w.metadata->>'gameId', '') IS NOT NULL
      AND w."createdAt" >= ${start}::timestamp AND w."createdAt" < ${end}::timestamp
      ${roomId === null ? Prisma.empty : Prisma.sql`AND w.metadata->>'roomId' = ${roomId}`}`;
}

// A short quiet interval combines callbacks arriving together. The durable round
// id prevents retries/late callbacks from announcing the same round twice.
// Aggregate all bets for the player/round (not just the winning selection).
export function tulasiWinCandidatesSql(since, now) {
  const quiet = new Date(now.getTime() - 2000);
  return Prisma.sql`WITH recent AS (
    SELECT DISTINCT "userId", metadata->>'gameId' AS game, metadata->>'gameStartTimestamp' AS round
    FROM "WalletTransaction"
    WHERE metadata->>'provider' = 'TULASI' AND type = 'GAME_PAYOUT'
      AND "createdAt" >= ${since}::timestamp AND "createdAt" <= ${quiet}::timestamp
      AND NULLIF(metadata->>'gameId', '') IS NOT NULL
      AND metadata->>'gameStartTimestamp' ~ '^[0-9]{10,16}$'
  ), rounds AS (
    SELECT r."userId", r.game, r.round, MIN(w.metadata->>'roomId') AS "roomId",
      MAX(w."createdAt") FILTER (WHERE w.type = 'GAME_PAYOUT') AS confirmed,
      SUM(w.coins) FILTER (WHERE w.type = 'GAME_WAGER') AS wager,
      SUM(w.coins) FILTER (WHERE w.type = 'GAME_PAYOUT') AS payout,
      array_agg(w.id ORDER BY w.id) AS ids
    FROM recent r JOIN "WalletTransaction" w ON w."userId" = r."userId"
      AND w.metadata->>'provider' = 'TULASI' AND w.metadata->>'gameId' = r.game
      AND w.metadata->>'gameStartTimestamp' = r.round
    WHERE w.type IN ('GAME_WAGER', 'GAME_PAYOUT')
    GROUP BY r."userId", r.game, r.round
    HAVING bool_and(w.status = 'COMPLETED' AND w."referenceId" LIKE 'tulasi:%' AND w.coins >= 0
      AND ((w.type = 'GAME_WAGER' AND w.direction = 'DEBIT') OR (w.type = 'GAME_PAYOUT' AND w.direction = 'CREDIT')))
      AND COUNT(DISTINCT w.metadata->>'roomId') = 1
      AND bool_and(NULLIF(w.metadata->>'roomId', '') IS NOT NULL)
      AND MAX(w."createdAt") <= ${quiet}::timestamp
      AND bool_and(CASE WHEN w.metadata->>'gameEndTimestamp' ~ '^[0-9]{10,16}$'
        THEN (w.metadata->>'gameEndTimestamp')::numeric <= ${now.getTime()} ELSE TRUE END)
  ) SELECT 'GAME_WIN:TULASI:' || md5(jsonb_build_array(r."userId", r.game, r.round)::text) AS id,
    'GAME_WIN' AS type, r."userId" AS "actorId", r."roomId", (r.payout-r.wager)::text AS amount,
    r.confirmed, r.ids AS "sourceIds",
    jsonb_build_object('provider', 'TULASI', 'gameId', 'tulasi:' || r.game,
      'gameName', COALESCE(g.name, 'Tulasi game'), 'roundStart', r.round, 'wagerCoins', r.wager::text,
      'payoutCoins', r.payout::text, 'netProfitCoins', (r.payout-r.wager)::text) AS details
    FROM rounds r LEFT JOIN "TulasiGame" g ON g."tulasiId"::text = r.game
    WHERE r.wager > 0 AND r.payout > r.wager`;
}

// Revalidate the whole round, including callbacks that arrived after collection.
// A changed/reversed source suppresses the stale banner rather than overstating a win.
export async function tulasiWinStillValid(db, row) {
  const details = row.payload.details;
  if (!details?.roundStart || !details.gameId?.startsWith("tulasi:")) return false;
  const round = await db.$queryRaw`SELECT id, type, status, direction, coins::text AS coins, metadata FROM "WalletTransaction"
    WHERE "userId" = ${row.actorId} AND type IN ('GAME_WAGER', 'GAME_PAYOUT')
      AND metadata->>'provider' = 'TULASI' AND metadata->>'gameId' = ${details.gameId.slice(7)}
      AND metadata->>'gameStartTimestamp' = ${String(details.roundStart)}`;
  const ids = new Set(row.sourceIds);
  if (!round.length || round.length !== ids.size || round.some(s => !ids.has(s.id) ||
    s.status !== "COMPLETED" || s.metadata?.roomId !== row.roomId || s.coins === null || s.coins < 0n ||
    s.direction !== (s.type === "GAME_WAGER" ? "DEBIT" : "CREDIT"))) return false;
  const sum = type => round.filter(s => s.type === type).reduce((total, s) => total + BigInt(s.coins), 0n);
  return sum("GAME_PAYOUT") - sum("GAME_WAGER") === BigInt(row.payload.amount);
}
