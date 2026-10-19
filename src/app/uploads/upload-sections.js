export const UPLOAD_SECTIONS = {
  Props: ["Frames", "Profile Dresses", "Entrance Strip", "Rides", "Badges", "User Tags", "Profile BG", "Chat Boxes", "Room Frames", "Room Backgrounds", "Seat Styles", "Business Cards"],
  Gifts: ["Gifts"],
  "Other Assets": ["Banners", "Agency Artwork", "VIP Stickers", "Campaign Widgets", "Music", "APK"],
};
export function filterUploadRecords(records, { query = "", status = "ALL", giftTier = "ALL" } = {}) {
  const search = query.trim().toLowerCase();
  return records.filter(item => (!search || `${item.name} ${item.id}`.toLowerCase().includes(search)) &&
    (status === "ALL" || Boolean(item.active) === (status === "ACTIVE")) &&
    (giftTier === "ALL" || (item.giftCategory ?? (["VIP","LUCKY"].includes(item.giftTier) ? item.giftTier : "NORMAL")) === giftTier));
}
