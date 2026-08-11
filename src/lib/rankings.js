export const rankingTypes = new Set([
  "overall",
  "streamers",
  "listeners",
  "liveRooms",
  "earners",
]);

export const rankingPeriods = new Set(["today", "week", "month", "allTime"]);

export function rankingPeriodStart(period, now = new Date()) {
  if (!rankingPeriods.has(period)) throw rankingValidationError("period is invalid.");
  if (period === "allTime") return null;
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (period === "week") {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  }
  if (period === "month") start.setUTCDate(1);
  return start;
}

export function rankingScoreLabel(type) {
  if (type === "listeners") return "Engagement Coins";
  if (type === "liveRooms") return "Room Score";
  return "Coins";
}

export function sortRankingEntries(entries) {
  return [...entries].sort((left, right) => {
    if (left.score !== right.score) return left.score > right.score ? -1 : 1;
    return left.user.publicId.localeCompare(right.user.publicId);
  });
}

export function encodeRankingCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function decodeRankingCursor(value) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error();
    return parsed.offset;
  } catch {
    throw rankingValidationError("cursor is invalid.");
  }
}

export function liveRoomScore({ giftCoins, liveMinutes, participants }) {
  return giftCoins + BigInt(liveMinutes) + BigInt(participants) * 100n;
}

export function rankingValidationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  return error;
}
