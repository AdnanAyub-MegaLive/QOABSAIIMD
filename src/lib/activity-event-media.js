import { createPublicDisplayAssetUrl } from "./upload-assets.js";

export function activityMediaOrigin() {
  const value = process.env.MOBILE_API_BASE_URL || process.env.AUTH_URL;
  if (!value) return null;
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid activity media origin configuration.");
  return url.origin;
}

// Re-sign immediately before delivery, including after long outbox retries.
// Keep the badge ID from the committed snapshot, not a newer level's badge.
export async function refreshActivityEventMedia(payload, db) {
  const id = payload.data?.badgeAssetId;
  if (!id) return payload;
  const origin = activityMediaOrigin();
  if (!origin) throw new Error("Configure MOBILE_API_BASE_URL for activity badge delivery.");
  const asset = await db.uploadAsset.findUnique({ where: { publicId: id }, select: { publicId: true, active: true, mediaVersion: true, mimeType: true } });
  return { ...payload, data: { ...payload.data, badgeUrl: asset?.active ? createPublicDisplayAssetUrl(origin, asset) : null, badgeMediaVersion: asset?.active ? asset.mediaVersion : null, badgeMimeType: asset?.active ? asset.mimeType : null } };
}
