export const manifestGiftTiers = ["CLASSIC", "PREMIUM", "VIP", "LUCKY", "BLIND_BOX"];
export const manifestDisplayCategories = new Set(["FRAMES", "ROOM_FRAMES", "RIDES", "ENTRANCES", "BADGES", "USER_TAGS", "TAIL_LIGHTS", "PROFILE_BG", "PROFILE_DRESS", "ROOM_BACKGROUNDS", "SEAT_STYLES", "CHAT_BOXES", "BUSINESS_CARD", "VIP_STICKERS", "CAMPAIGN_WIDGETS", "AGENCY_ARTWORK", "GAME_ICONS", "GIFTS", "LIVE_GIFTS"]);
export const manifestListedOnlyCategories = ["BANNERS", "MEDALS", "ROLE_ARTWORK"];
export const manifestCategories = [...manifestDisplayCategories, ...manifestListedOnlyCategories];
export const manifestMimeTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/svga", "video/mp4"];
