import { createPublicDisplayAssetUrl, musicTrackMimeTypes } from "./upload-assets.js";
import { prisma } from "./prisma.js";

export function serializeCatalogTrack(asset, origin, ttlSeconds = 21600) {
  const trackUrl = createPublicDisplayAssetUrl(origin, asset.publicId, ttlSeconds);
  return {
    id: asset.publicId,
    title: asset.name,
    artist: asset.details || null,
    durationSeconds: null,
    mimeType: asset.mimeType,
    trackUrl,
    url: trackUrl,
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export async function resolveCatalogTrack(catalogTrackId, origin) {
  const id = String(catalogTrackId ?? "").trim();
  if (!id) throw Object.assign(new Error("A catalog track ID is required."), { code: "MUSIC_TRACK_NOT_FOUND" });
  const asset = await prisma.uploadAsset.findFirst({
    where: { publicId: id, category: "MUSIC_TRACKS", active: true, isGlobal: true, mimeType: { in: [...musicTrackMimeTypes] } },
    select: { publicId: true, name: true, details: true, mimeType: true, updatedAt: true },
  });
  if (!asset) throw Object.assign(new Error("The selected catalog track is unavailable."), { code: "MUSIC_TRACK_NOT_FOUND" });
  return serializeCatalogTrack(asset, origin);
}
