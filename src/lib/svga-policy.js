// Shared with the upload UI. Categories rendered as ordinary images/video stay restricted.
export const SVGA_MIME = "application/svga";
export const SVGA_MAX_BYTES = 8 * 1024 * 1024;
export const SVGA_CATEGORIES = new Set([
  "GIFTS", "LIVE_GIFTS", "FRAMES", "ENTRANCES", "RIDES", "BADGES",
  "CHAT_BOXES", "VIP_STICKERS", "CAMPAIGN_WIDGETS",
]);
export function isSvgaFile(file) {
  return /\.svga$/i.test(file?.name ?? "") || [SVGA_MIME, "application/x-svga"].includes(file?.type);
}
export function uploadMimeType(file) {
  return isSvgaFile(file) ? SVGA_MIME : file?.type;
}
