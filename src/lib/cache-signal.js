export const CACHE_SCOPE_EVENTS = {
  "props:updated": ["profile"],
  "props:granted": ["profile"],
  "props:revoked": ["profile"],
  "vip:updated": ["profile"],
  "special-id:assigned": ["profile"],
  "special-id:revoked": ["profile"],
  "special-id:expired": ["profile"],
  "user:roles-changed": ["profile"],
  "profile:updated": ["profile"],
  "progression:updated": ["progression"],
};

export function cacheScopesFor(event) {
  return CACHE_SCOPE_EVENTS[event] ?? null;
}

export function cacheInvalidatePayload(scopes, extra = {}) {
  return { success: true, data: { scopes: [...new Set(scopes)], at: new Date().toISOString(), ...extra } };
}

export function signalUserCache(io, publicId, scopes, extra = {}) {
  if (!io || !publicId || !scopes?.length) return;
  try { io.to(`user:${publicId}`).emit("cache:invalidate", cacheInvalidatePayload(scopes, { userId: publicId, ...extra })); }
  catch (error) { console.error("Cache signal failed", error?.message); }
}

export function signalAllCache(io, scopes, extra = {}) {
  if (!io || !scopes?.length) return;
  try { io.emit("cache:invalidate", cacheInvalidatePayload(scopes, { global: true, ...extra })); }
  catch (error) { console.error("Cache signal failed", error?.message); }
}

export function signalCacheForEvent(io, channel, event, payload) {
  const scopes = cacheScopesFor(event);
  if (!scopes || typeof channel !== "string" || !channel.startsWith("user:")) return;
  if (event === "progression:updated" && !(payload?.data?.levelsGained?.length > 0)) return;
  signalUserCache(io, channel.slice("user:".length), scopes, { reason: event });
}
