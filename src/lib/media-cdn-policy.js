// Only public catalogue artwork. Private assignments, music and identity documents
// must never become public simply because they are stored in UploadAsset.
const categories = new Set(["BANNERS", "GIFTS", "LIVE_GIFTS", "FRAMES", "BADGES", "ROOM_BACKGROUNDS", "SEAT_STYLES", "ENTRANCES", "RIDES", "TAIL_LIGHTS", "CHAT_BOXES", "BUSINESS_CARD", "VIP_STICKERS", "CAMPAIGN_WIDGETS", "PROFILE_DRESS", "MEDALS", "ROLE_ARTWORK", "AGENCY_ARTWORK"]);
const types = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"]);
export function canPublishMedia(asset) {
  return asset.active !== false && !asset.audioRoomId && categories.has(asset.category)
    && Boolean(asset.isGlobal || asset.storeVisible) && types.has(asset.mimeType);
}
export function publicCdnUrl(asset, poster = false) {
  if (process.env.MEDIA_CDN_ENABLED !== "true" || !canPublishMedia(asset)) return null;
  const value = poster ? asset.posterCdnUrl : asset.cdnUrl;
  if (!value) return null;
  try {
    const base = new URL(process.env.MEDIA_CDN_BASE_URL);
    const url = new URL(value);
    return base.protocol === "https:" && url.origin === base.origin && url.pathname.startsWith("/portal-media/") ? url.href : null;
  } catch { return null; }
}
