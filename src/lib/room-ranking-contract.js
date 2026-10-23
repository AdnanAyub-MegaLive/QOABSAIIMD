import { createHash } from "node:crypto";

export const rankingError = (code, message, status = 422) => Object.assign(new Error(message), { code, status });
export const rankingHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function roomRankingPeriod(period, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let end;
  if (period === "DAILY") end = new Date(start.getTime() + 86400000);
  else if (period === "WEEKLY") {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    end = new Date(start.getTime() + 7 * 86400000);
  } else if (period === "MONTHLY") {
    start.setUTCDate(1);
    end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  } else throw rankingError("VALIDATION_ERROR", "period must be DAILY, WEEKLY or MONTHLY.");
  return { period, timezone: "UTC", start: start.toISOString(), end: end.toISOString(), nextResetAt: end.toISOString() };
}

export function parseRoomRankingQuery(params) {
  const category = (params.get("category") || "WEALTH").toUpperCase();
  const period = (params.get("period") || "DAILY").toUpperCase();
  if (!["WEALTH", "CHARM", "GAMES"].includes(category)) throw rankingError("VALIDATION_ERROR", "Unknown ranking category.");
  roomRankingPeriod(period);
  const page = Number(params.get("page") || 1), limit = Number(params.get("limit") || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw rankingError("VALIDATION_ERROR", "page must be 1–100000 and limit 1–50.");
  const snapshotId = params.get("snapshotId") || null;
  if (snapshotId && !/^[a-f0-9-]{36}$/.test(snapshotId)) throw rankingError("VALIDATION_ERROR", "Invalid snapshotId.");
  if (page > 1 && !snapshotId) throw rankingError("SNAPSHOT_REQUIRED", "Use the snapshotId returned by page 1.", 409);
  return { category, period, page, limit, snapshotId };
}

// SQL has already grouped trusted transaction rows; no floating-point amounts.
export function rankRoomScores(rows) {
  const players = new Map();
  for (const row of rows) {
    const score = BigInt(row.score);
    if (score <= 0n) continue;
    const player = players.get(row.userId) || { userId: row.userId, score: 0n, games: [] };
    player.score += score;
    if (row.gameId) player.games.push({ gameId: row.gameId, score: score.toString(), unit: "COINS_WAGERED" });
    players.set(row.userId, player);
  }
  return [...players.values()].sort((a, b) => a.score === b.score ? (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0) : a.score > b.score ? -1 : 1)
    .map((p, i) => ({ ...p, rank: i + 1, score: p.score.toString(), games: p.games.sort((a, b) => a.gameId.localeCompare(b.gameId)) }));
}
