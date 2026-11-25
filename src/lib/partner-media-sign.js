import { createHmac, timingSafeEqual } from "node:crypto";

export const PARTNER_MEDIA_TTL_SECONDS = 900;
const WINDOW_SECONDS = 300;
export const partnerMediaKinds = { image: "POSTER", motion: "MOTION" };

function secret() {
  const value = process.env.PARTNER_MEDIA_SECRET || (process.env.NODE_ENV === "production" ? null : process.env.AUTH_SECRET);
  if (!value) {
    console.error("Partner media secret missing: set PARTNER_MEDIA_SECRET");
    throw new Error("PARTNER_MEDIA_SECRET is required for partner media URLs.");
  }
  return value;
}

export function partnerMediaSignature(assetId, kind, keyId, exp) {
  return createHmac("sha256", secret()).update(`partner-media:${assetId}:${kind}:${keyId}:${exp}`).digest("base64url");
}

export function partnerMediaExpiry(now = Date.now()) {
  return Math.floor(now / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS + PARTNER_MEDIA_TTL_SECONDS;
}

export function createPartnerMediaUrl(base, assetId, kind, keyId, exp = partnerMediaExpiry()) {
  const url = new URL(`/api/partner/v1/media/${encodeURIComponent(assetId)}/${kind}`, base);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("key", keyId);
  url.searchParams.set("sig", partnerMediaSignature(assetId, kind, keyId, exp));
  return url.toString();
}

export function verifyPartnerMediaSignature(assetId, kind, { exp, key, sig }, now = Date.now()) {
  const expiry = Number(exp);
  if (!assetId || !Object.hasOwn(partnerMediaKinds, kind) || !key || !sig || !Number.isInteger(expiry)) return false;
  const nowSeconds = Math.floor(now / 1000);
  if (expiry <= nowSeconds || expiry > nowSeconds + PARTNER_MEDIA_TTL_SECONDS) return false;
  const expected = Buffer.from(partnerMediaSignature(assetId, kind, key, expiry));
  const supplied = Buffer.from(String(sig));
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function requestSourceOrigin(request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try { return new URL(referer).origin; } catch { return null; }
}

export function corsOrigin(allowedOrigins, request) {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins?.includes(origin) ? origin : null;
}

export function originAllowed(allowedOrigins, request) {
  if (!allowedOrigins?.length) return true;
  const source = requestSourceOrigin(request);
  return Boolean(source && allowedOrigins.includes(source));
}
