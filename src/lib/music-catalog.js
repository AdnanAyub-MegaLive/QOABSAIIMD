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

export function catalogTrackWhere(catalogTrackId, audioRoomId = null) {
  const id = String(catalogTrackId ?? "").trim();
  if (!id) throw Object.assign(new Error("A catalog track ID is required."), { code: "MUSIC_TRACK_NOT_FOUND" });
  return {
    publicId: id,
    category: "MUSIC_TRACKS",
    active: true,
    mimeType: { in: [...musicTrackMimeTypes] },
    OR: [{ isGlobal: true, audioRoomId: null }, ...(audioRoomId ? [{ audioRoomId, isGlobal: false }] : [])],
  };
}

export function validateRoomMusicUpload({ size, declaredMimeType, detectedMimeType, durationSeconds = null }) {
  const maximumBytes = 20 * 1024 * 1024;
  const declared = String(declaredMimeType ?? "").toLowerCase();
  const detected = String(detectedMimeType ?? "").toLowerCase();
  if (!Number.isSafeInteger(size) || size < 1 || size > maximumBytes) throw Object.assign(new Error("Music tracks must be no larger than 20 MB."), { code: "MUSIC_FILE_TOO_LARGE" });
  if (!musicTrackMimeTypes.has(declared) || !musicTrackMimeTypes.has(detected)) throw Object.assign(new Error("Music tracks must be MP3, M4A, AAC, OGG, or WAV audio."), { code: "MUSIC_FILE_TYPE_INVALID" });
  const duration = durationSeconds === null || durationSeconds === undefined || durationSeconds === "" ? null : Number(durationSeconds);
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 900)) throw Object.assign(new Error("Music tracks must be no longer than 15 minutes."), { code: "MUSIC_DURATION_INVALID" });
  return { durationSeconds: duration === null ? null : Math.round(duration * 1000) / 1000, mimeType: detected };
}

export async function resolveCatalogTrack(catalogTrackId, origin, audioRoomId = null) {
  const asset = await prisma.uploadAsset.findFirst({
    where: catalogTrackWhere(catalogTrackId, audioRoomId),
    select: { publicId: true, name: true, details: true, mimeType: true, tags: true, updatedAt: true },
  });
  if (!asset) throw Object.assign(new Error("The selected catalog track is unavailable."), { code: "MUSIC_TRACK_NOT_FOUND" });
  const serialized = serializeCatalogTrack(asset, origin);
  const durationTag = asset.tags.find((tag) => tag.startsWith("duration:"));
  const durationSeconds = Number(durationTag?.slice("duration:".length));
  return { ...serialized, durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null };
}
