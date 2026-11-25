import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { assetAddress, hasPoster } from "./asset-address.js";
import { manifestCategories, manifestGiftTiers, manifestMimeTypes } from "./asset-manifest-policy.js";

export { manifestCategories, manifestMimeTypes };
const cacheTtlMs = 60000;
const manifestCache = new Map();

const firstPriority = new Set(["GIFTS", "LIVE_GIFTS"]);
const secondPriority = new Set(["FRAMES", "ROOM_FRAMES", "RIDES", "ENTRANCES", "BADGES", "USER_TAGS", "MEDALS"]);

export const manifestSelect = {
  publicId: true, category: true, mimeType: true, fileSize: true, mediaVersion: true,
  posterMimeType: true, posterFileSize: true, posterMediaVersion: true, cdnUrl: true, posterCdnUrl: true,
  active: true, isGlobal: true, storeVisible: true, audioRoomId: true, sortOrder: true,
};

export function manifestWhereAt(now = new Date()) {
  return {
    archivedAt: null,
    active: true,
    audioRoomId: null,
    category: { in: manifestCategories },
    mimeType: { in: manifestMimeTypes },
    mediaVersion: { not: null },
    fileSize: { gt: 0 },
    OR: [
      { category: "GIFTS", giftTier: { in: manifestGiftTiers }, coinPrice: { gt: 0n } },
      { category: "LIVE_GIFTS", coinPrice: { gt: 0n } },
      {
        category: { notIn: ["GIFTS", "LIVE_GIFTS"] },
        OR: [
          { isGlobal: true },
          { storeVisible: true },
          { assignments: { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
          { vipBenefits: { some: { tier: { active: true } } } },
          { levelTagBackgrounds: { some: {} } },
        ],
      },
    ],
  };
}

export async function isManifestAsset(publicId, { db = prisma, now = new Date() } = {}) {
  const row = await db.uploadAsset.findFirst({ where: { AND: [manifestWhereAt(now), { publicId }] }, select: { publicId: true } });
  return Boolean(row);
}

export function assetPriority(category) {
  return firstPriority.has(category) ? 1 : secondPriority.has(category) ? 2 : 3;
}

export function manifestVersionFor(assets) {
  const lines = assets.map(asset => `${asset.assetId}:${asset.version}:${asset.posterVersion ?? ""}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 32);
}

export function manifestEntry(asset, origin) {
  const entry = {
    assetId: asset.publicId,
    version: asset.mediaVersion,
    kind: asset.mimeType,
    size: asset.fileSize,
    url: assetAddress(asset, { origin }),
    category: asset.category,
    priority: assetPriority(asset.category),
  };
  const posterAllowed = hasPoster(asset) && asset.posterMediaVersion && manifestMimeTypes.includes(asset.posterMimeType);
  if (posterAllowed) {
    entry.posterVersion = asset.posterMediaVersion;
    entry.posterKind = asset.posterMimeType;
    entry.posterUrl = assetAddress(asset, { origin, poster: true });
    if (asset.posterFileSize) entry.posterSize = asset.posterFileSize;
  }
  return entry;
}

export function clearAssetManifestCache() {
  manifestCache.clear();
}

export async function cachedAssetManifest(origin, { db = prisma, now = Date.now() } = {}) {
  const hit = manifestCache.get(origin);
  if (hit && now - hit.at < cacheTtlMs) return hit.manifest;
  const manifest = await buildAssetManifest(origin, { db, now: new Date(now) });
  manifestCache.set(origin, { at: now, manifest });
  if (manifestCache.size > 20) manifestCache.delete(manifestCache.keys().next().value);
  return manifest;
}

export async function buildAssetManifest(origin, { db = prisma, now = new Date() } = {}) {
  const rows = await db.uploadAsset.findMany({
    where: manifestWhereAt(now),
    select: manifestSelect,
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { publicId: "asc" }],
  });
  const assets = rows.map(row => manifestEntry(row, origin))
    .sort((a, b) => a.priority - b.priority || a.assetId.localeCompare(b.assetId));
  return { manifestVersion: manifestVersionFor(assets), generatedAt: now.toISOString(), assets };
}

export function etagMatches(header, version) {
  if (!header) return false;
  return header.split(",").some(tag => ["*", `"${version}"`, `W/"${version}"`].includes(tag.trim()));
}
