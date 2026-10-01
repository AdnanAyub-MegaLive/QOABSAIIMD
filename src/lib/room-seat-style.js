import { createPublicDisplayAssetUrl } from "./upload-assets.js";

export const seatStyleMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isSupportedSeatStyleMimeType(mimeType) {
  return seatStyleMimeTypes.has(String(mimeType ?? "").toLowerCase());
}

export function serializeRoomSeatStyle(room, origin) {
  const asset = room?.seatStyleAsset;
  const now = new Date();
  const ownerCanUse = asset?.isGlobal || asset?.assignments?.some(
    (assignment) => assignment.userId === room.ownerId && (!assignment.expiresAt || assignment.expiresAt > now),
  );
  if (!asset || !asset.active || !ownerCanUse || !isSupportedSeatStyleMimeType(asset.mimeType)) {
    return { assetId: null, url: null, mimeType: null, version: room?.seatStyleVersion ?? 0 };
  }
  return {
    assetId: asset.publicId,
    url: createPublicDisplayAssetUrl(origin, asset.publicId, 21600),
    mimeType: asset.mimeType,
    version: room.seatStyleVersion ?? 0,
  };
}

export function seatStyleError(code, message) {
  const error = new Error(message ?? code);
  error.code = code;
  return error;
}
