import { createPublicDisplayAssetUrl } from "./upload-assets.js";

export const roomBackgroundMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
]);

export function isSupportedRoomBackgroundMimeType(mimeType) {
  return roomBackgroundMimeTypes.has(String(mimeType ?? "").toLowerCase());
}

export function serializeRoomBackground(room, origin) {
  const asset = room?.roomBackgroundAsset;
  const now = new Date();
  const ownerCanUse = asset?.isGlobal || asset?.assignments?.some(
    (assignment) => assignment.userId === room.ownerId && (!assignment.expiresAt || assignment.expiresAt > now),
  );
  if (!asset || !asset.active || !ownerCanUse || !isSupportedRoomBackgroundMimeType(asset.mimeType)) {
    return {
      assetId: null,
      url: null,
      mimeType: null,
      version: room?.roomBackgroundVersion ?? 0,
    };
  }
  return {
    assetId: asset.publicId,
    url: createPublicDisplayAssetUrl(origin, asset, 21600),
    mediaVersion:asset.mediaVersion??null,
    mimeType: asset.mimeType,
    version: room.roomBackgroundVersion ?? 0,
  };
}

export function roomBackgroundError(code, message) {
  const error = new Error(message ?? code);
  error.code = code;
  return error;
}
