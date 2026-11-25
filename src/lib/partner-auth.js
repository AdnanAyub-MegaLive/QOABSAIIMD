import { hashPartnerKey } from "./partner-keys.js";
import { isRateLimited } from "./rate-limit.js";

const globalState = globalThis;
const keyCache = globalState.partnerKeyCache ??= new Map();
const lastUsedWrites = globalState.partnerKeyLastUsed ??= new Map();
const KEY_CACHE_MS = 5000;
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export class PartnerApiError extends Error {
  constructor(code, message, status, headers = {}) { super(message); this.code = code; this.status = status; this.headers = headers; }
}

export function clearPartnerKeyCache() { keyCache.clear(); }

export function partnerErrorResponse(error, fallback = "PARTNER_REQUEST_FAILED") {
  if (error instanceof PartnerApiError)
    return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status, headers: { "Cache-Control": "no-store", ...error.headers } });
  console.error("Partner API failed", error);
  return Response.json({ success: false, error: { code: fallback, message: "Request failed." } }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function findPartnerKeyByHash(db, keyHash, now = Date.now()) {
  const cached = keyCache.get(keyHash);
  if (cached && cached.expires > now) return cached.key;
  const key = await db.partnerApiKey.findUnique({ where: { keyHash }, select: { id: true, publicId: true, name: true, active: true, revokedAt: true, allowedOrigins: true } });
  if (!key) return null;
  keyCache.set(keyHash, { key, expires: now + KEY_CACHE_MS });
  if (keyCache.size > 1000) keyCache.delete(keyCache.keys().next().value);
  return key;
}

export async function findPartnerKeyByPublicId(db, publicId) {
  const key = await db.partnerApiKey.findUnique({ where: { publicId }, select: { id: true, publicId: true, active: true, revokedAt: true, allowedOrigins: true } });
  return key && key.active && !key.revokedAt ? key : null;
}

export function touchPartnerKey(db, key, now = Date.now()) {
  const last = lastUsedWrites.get(key.id) ?? 0;
  if (now - last < LAST_USED_THROTTLE_MS) return false;
  lastUsedWrites.set(key.id, now);
  Promise.resolve(db.partnerApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date(now) } })).catch(() => {});
  return true;
}

export function logPartnerCall(key, request, status) {
  const url = new URL(request.url);
  console.info(JSON.stringify({ event: "partner_api_call", key: key?.publicId ?? null, path: url.pathname, status, at: new Date().toISOString() }));
}

export function rateLimitPartner(bucket, limit) {
  if (isRateLimited(bucket, { limit, windowMs: 60000 }))
    throw new PartnerApiError("RATE_LIMITED", "Too many requests. Try again in a minute.", 429, { "Retry-After": "60" });
}

export function clientAddress(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function authenticatePartner(db, request) {
  rateLimitPartner(`partner-ip:${clientAddress(request)}`, 120);
  const raw = request.headers.get("x-partner-key")?.trim();
  if (!raw) throw new PartnerApiError("UNAUTHORIZED", "X-Partner-Key header is required.", 401);
  if (raw.length > 200) throw new PartnerApiError("UNAUTHORIZED", "Partner key is invalid.", 401);
  const key = await findPartnerKeyByHash(db, hashPartnerKey(raw));
  if (!key || !key.active || key.revokedAt) throw new PartnerApiError("UNAUTHORIZED", "Partner key is invalid or revoked.", 401);
  rateLimitPartner(`partner:${key.id}`, 60);
  touchPartnerKey(db, key);
  return key;
}
