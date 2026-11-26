import { createHash } from "node:crypto";
import { PartnerApiError } from "./partner-auth.js";
import { createPartnerMediaUrl, partnerMediaExpiry } from "./partner-media-sign.js";
import { hasMotionSource } from "./partner-previews.js";
import { uploadCategories } from "./upload-assets.js";

const categoryLabels = Object.fromEntries(Object.entries(uploadCategories).map(([label, code]) => [code, label]));

export const PARTNER_DEFAULT_LIMIT = 20;
export const PARTNER_MAX_LIMIT = 50;
const CACHE_TTL_MS = 30000;
const globalState = globalThis;
const cache = globalState.partnerCatalogCache ??= new Map();

export const mallItemWhere = { active: true, archivedAt: null, storeVisible: true, category: { not: "BANNERS" } };
const itemSelect = { id: true, publicId: true, name: true, category: true, mimeType: true, mediaVersion: true, posterMediaVersion: true, updatedAt: true };

export function clearPartnerCatalogCache() { cache.clear(); }

export function encodeCursor(row) {
  return Buffer.from(JSON.stringify([row.updatedAt.toISOString(), row.publicId])).toString("base64url");
}

export function decodeCursor(value) {
  try {
    const [at, publicId] = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const updatedAt = new Date(at);
    if (Number.isNaN(updatedAt.getTime()) || typeof publicId !== "string" || !publicId) throw new Error();
    return { updatedAt, publicId };
  } catch { throw new PartnerApiError("INVALID_CURSOR", "Cursor is invalid.", 400); }
}

export function parseListQuery(searchParams) {
  const rawLimit = searchParams.get("limit");
  let limit = PARTNER_DEFAULT_LIMIT;
  if (rawLimit != null && rawLimit !== "") {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) throw new PartnerApiError("VALIDATION_ERROR", "limit must be a positive integer.", 400);
    limit = Math.min(limit, PARTNER_MAX_LIMIT);
  }
  const rawSince = searchParams.get("updatedSince");
  let updatedSince = null;
  if (rawSince) {
    updatedSince = new Date(rawSince);
    if (Number.isNaN(updatedSince.getTime())) throw new PartnerApiError("VALIDATION_ERROR", "updatedSince must be an ISO 8601 date-time.", 400);
  }
  const rawCursor = searchParams.get("cursor");
  const rawRemovedCursor = searchParams.get("removedCursor");
  if (rawRemovedCursor && !updatedSince) throw new PartnerApiError("VALIDATION_ERROR", "removedCursor requires updatedSince.", 400);
  return { limit, updatedSince, cursor: rawCursor ? decodeCursor(rawCursor) : null, removedCursor: rawRemovedCursor ? decodeCursor(rawRemovedCursor) : null };
}

function listWhere({ updatedSince, cursor }) {
  const and = [mallItemWhere];
  if (updatedSince) and.push({ updatedAt: { gte: updatedSince } });
  if (cursor) and.push({ OR: [{ updatedAt: { gt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, publicId: { gt: cursor.publicId } }] });
  return { AND: and };
}

async function cached(key, load, now = Date.now()) {
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = await load();
  cache.set(key, { value, expires: now + CACHE_TTL_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

export async function loadItemPage(db, query) {
  const key = `list:${query.limit}:${query.updatedSince?.toISOString() ?? ""}:${query.cursor ? encodeCursor(query.cursor) : ""}`;
  return cached(key, async () => {
    const rows = await db.uploadAsset.findMany({ where: listWhere(query), select: itemSelect, orderBy: [{ updatedAt: "asc" }, { publicId: "asc" }], take: query.limit + 1 });
    const page = rows.slice(0, query.limit);
    return { rows: page, nextCursor: rows.length > query.limit ? encodeCursor(page.at(-1)) : null };
  });
}

export const REMOVED_PAGE_SIZE = 1000;
export const REMOVAL_RETENTION_DAYS = 90;

export function needsFullSync(updatedSince, now = Date.now()) {
  return updatedSince.getTime() < now - REMOVAL_RETENTION_DAYS * 86400000;
}

export async function loadRemovedPage(db, updatedSince, removedCursor) {
  const key = `removed:${updatedSince.toISOString()}:${removedCursor ? encodeCursor({ updatedAt: removedCursor.updatedAt, publicId: removedCursor.publicId }) : ""}`;
  return cached(key, async () => {
    const and = [{ removedAt: { gte: updatedSince } }];
    if (removedCursor) and.push({ OR: [{ removedAt: { gt: removedCursor.updatedAt } }, { removedAt: removedCursor.updatedAt, id: { gt: removedCursor.publicId } }] });
    const rows = await db.partnerCatalogRemoval.findMany({ where: { AND: and }, select: { id: true, assetPublicId: true, removedAt: true }, orderBy: [{ removedAt: "asc" }, { id: "asc" }], take: REMOVED_PAGE_SIZE + 1 });
    const page = rows.slice(0, REMOVED_PAGE_SIZE);
    const ids = [...new Set(page.map((row) => row.assetPublicId))];
    const live = ids.length ? await db.uploadAsset.findMany({ where: { ...mallItemWhere, publicId: { in: ids } }, select: { publicId: true } }) : [];
    const liveIds = new Set(live.map((row) => row.publicId));
    const truncated = rows.length > REMOVED_PAGE_SIZE;
    const last = page.at(-1);
    return { removed: ids.filter((id) => !liveIds.has(id)), removedCursor: truncated ? Buffer.from(JSON.stringify([last.removedAt.toISOString(), last.id])).toString("base64url") : null, removedTruncated: truncated };
  });
}

export async function loadItem(db, publicId) {
  return cached(`item:${publicId}`, () => db.uploadAsset.findFirst({ where: { ...mallItemWhere, publicId }, select: itemSelect }));
}

export function partnerItem(row, base, key, exp) {
  const media = { image: createPartnerMediaUrl(base, row.publicId, "image", key.publicId, exp) };
  if (hasMotionSource(row)) media.motion = createPartnerMediaUrl(base, row.publicId, "motion", key.publicId, exp);
  return { id: row.publicId, name: row.name, category: { code: row.category, label: categoryLabels[row.category] ?? row.category }, updatedAt: row.updatedAt.toISOString(), media };
}

export function catalogEtag(rows, extra, key, exp) {
  const hash = createHash("sha256");
  hash.update(`${key.publicId}:${exp}:${extra ?? ""}`);
  for (const row of rows) hash.update(`|${row.publicId}:${row.name}:${row.mimeType}:${row.mediaVersion ?? ""}:${row.posterMediaVersion ?? ""}:${row.updatedAt.toISOString()}`);
  return `"${hash.digest("base64url").slice(0, 32)}"`;
}

export function etagMatches(request, etag) {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  return header.split(",").map((v) => v.trim().replace(/^W\//, "")).some((v) => v === etag || v === "*");
}

export function partnerBase(request) {
  const configured = process.env.PARTNER_MEDIA_BASE_URL;
  if (configured) {
    try { return new URL(configured).origin; } catch { console.error("PARTNER_MEDIA_BASE_URL is invalid"); throw new PartnerApiError("SERVER_MISCONFIGURED", "Partner media is not configured.", 500); }
  }
  if (process.env.NODE_ENV === "production") {
    console.error("PARTNER_MEDIA_BASE_URL is required in production");
    throw new PartnerApiError("SERVER_MISCONFIGURED", "Partner media is not configured.", 500);
  }
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function partnerJson(body, etag, status = 200) {
  const headers = { "Cache-Control": "private, no-cache", Vary: "X-Partner-Key" };
  if (etag) headers.ETag = etag;
  return status === 304 ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}

export { partnerMediaExpiry };
