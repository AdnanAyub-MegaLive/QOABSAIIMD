export const HOURLY_GIFT_COALESCE_MS = 2000;
export const HOURLY_GIFT_CACHE_MS = 30000;
export const HOURLY_GIFT_UNIT = "COINS_SPENT";
export const hourlyError = (code, message, status = 422) => Object.assign(new Error(message), { code, status });

export function giftHours(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const previousStart = new Date(start.getTime() - 3600000);
  const end = new Date(start.getTime() + 3600000);
  return { timezone: "UTC", hourId: start.toISOString(), nextResetAt: end.toISOString(),
    current: { start: start.toISOString(), end: end.toISOString() },
    previous: { start: previousStart.toISOString(), end: start.toISOString() } };
}

export function orderHourlyScores(rows, visibleIds) {
  return rows.filter(r => visibleIds.has(r.userId) && BigInt(r.score) > 0n)
    .sort((a, b) => BigInt(a.score) === BigInt(b.score) ? (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0) : BigInt(a.score) > BigInt(b.score) ? -1 : 1)
    .map((r, index) => ({ userId: r.userId, score: r.score, rank: index + 1 }));
}

export function hourlyViewerPosition(entries, viewerId) {
  const mine = entries.find(e => e.userId === viewerId);
  const inTop50 = Boolean(mine && mine.rank <= 50);
  const score = mine?.score ?? "0";
  let additional = 0n;
  if (!inTop50) {
    const cutoff = entries[49];
    additional = cutoff ? BigInt(cutoff.score) - BigInt(score) + (viewerId < cutoff.userId ? 0n : 1n) : 1n;
    if (additional < 1n) additional = 1n;
  }
  return { ranked: Boolean(mine), rank: mine?.rank ?? null, sentCoins: score, unit: HOURLY_GIFT_UNIT, inTop50, additionalCoinsToTop50: additional.toString() };
}

export function hourlyCacheAction(cache, revision, now) {
  if (!cache || cache.expiresAt <= now) return "REBUILD";
  if (cache.sourceRevision === revision) return "REUSE";
  return now.getTime() - cache.generatedAt.getTime() < HOURLY_GIFT_COALESCE_MS ? "COALESCE" : "REBUILD";
}
