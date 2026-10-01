import { randomInt } from "node:crypto";

function contractError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function parseRedEnvelopeInput(body, limits = {}) {
  const roomId = String(body?.roomId ?? "").trim();
  const coinText = String(body?.totalCoins ?? "").trim();
  const shareCount = Number(body?.shareCount);
  const delaySeconds = Number(body?.delaySeconds);
  if (!roomId || !/^\d+$/.test(coinText)) throw contractError("VALIDATION_ERROR", "roomId and totalCoins are required.");
  const totalCoins = BigInt(coinText);
  const maxCoins = BigInt(limits.maxCoins ?? 10000000);
  const maxShareCount = Number(limits.maxShareCount ?? 100);
  const maxDelaySeconds = Number(limits.maxDelaySeconds ?? 300);
  if (totalCoins < 1n || totalCoins > maxCoins) throw contractError("VALIDATION_ERROR", `totalCoins must be between 1 and ${maxCoins}.`);
  if (!Number.isSafeInteger(shareCount) || shareCount < 1 || shareCount > maxShareCount) throw contractError("VALIDATION_ERROR", `shareCount must be between 1 and ${maxShareCount}.`);
  if (totalCoins < BigInt(shareCount)) throw contractError("VALIDATION_ERROR", "totalCoins must provide at least one coin per recipient.");
  if (!Number.isSafeInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > maxDelaySeconds) throw contractError("VALIDATION_ERROR", `delaySeconds must be between 0 and ${maxDelaySeconds}.`);
  return { roomId, totalCoins, shareCount, delaySeconds };
}

export function luckyShare(remainingCoins, remainingShares, random = randomInt) {
  if (remainingShares <= 1) return remainingCoins;
  const minimumRemainder = BigInt(remainingShares - 1);
  const available = remainingCoins - minimumRemainder;
  const average = remainingCoins / BigInt(remainingShares);
  const upper = available < average * 2n ? available : average * 2n;
  if (upper <= 1n) return 1n;
  const safeUpper = upper > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : upper;
  return BigInt(random(1, Number(safeUpper) + 1));
}
