const cache = new WeakMap();
const TTL_MS = 30_000;

export function parseRoomCardMinCoins(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text) || BigInt(text) > 9223372036854775807n) {
    throw Object.assign(new Error("Room card minimum must be a whole number between 0 and 9223372036854775807."), { status: 422 });
  }
  return BigInt(text);
}

export function invalidateRoomCardEnvelopeSettings(db) {
  cache.delete(db);
}

export async function roomCardMinCoins(db) {
  const existing = cache.get(db);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  if (existing?.pending) return existing.pending;
  const entry = {};
  entry.pending = db.redEnvelopeSettings.findUnique({
    where: { id: "DEFAULT" }, select: { roomCardMinCoins: true },
  }).then(row => {
    entry.value = row?.roomCardMinCoins ?? 0n;
    entry.expiresAt = Date.now() + TTL_MS;
    entry.pending = null;
    return entry.value;
  }).catch(error => {
    if (cache.get(db) === entry) cache.delete(db);
    throw error;
  });
  cache.set(db, entry);
  return entry.pending;
}
