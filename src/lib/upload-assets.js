export const uploadCategories = {
  "Profile Dresses": "PROFILE_DRESS",
  Medals: "MEDALS",
  "Role Artwork": "ROLE_ARTWORK",
  "Agency Artwork": "AGENCY_ARTWORK",
  Banners: "BANNERS",
  Frames: "FRAMES",
  "Entrance Strip": "ENTRANCES",
  Rides: "RIDES",
  "Tail-lights": "TAIL_LIGHTS",
  Gifts: "GIFTS",
  Badges: "BADGES",
  "Chat Boxes": "CHAT_BOXES",
  "Room Backgrounds": "ROOM_BACKGROUNDS",
  "Seat Styles": "SEAT_STYLES",
  "Business Cards": "BUSINESS_CARD",
  "VIP Stickers": "VIP_STICKERS",
  "Campaign Widgets": "CAMPAIGN_WIDGETS",
  Music: "MUSIC_TRACKS",
};

export const validUploadCategories = new Set(Object.values(uploadCategories));
export const bannerPlacements = ["PARTY", "HOT_TOP", "HOT_MID"];
export const validBannerPlacements = new Set(bannerPlacements);
export const bannerMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export const roomBackgroundMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
]);
export const seatStyleMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
export const businessCardMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4"]);
export const musicTrackMimeTypes = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav"]);
export const bannerCatalogOrderBy = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
  { publicId: "asc" },
];

export function bannerCatalogWhere(placement) {
  return {
    category: "BANNERS",
    placement: cleanBannerPlacement(placement, { required: true }),
    active: true,
    isGlobal: true,
  };
}

function validationError(message) {
  const error = new Error(message);
  error.code = "VALIDATION_ERROR";
  return error;
}

export function cleanBannerPlacement(value, { required = false } = {}) {
  const placement = String(value ?? "").trim();
  if (!placement && !required) return null;
  if (!validBannerPlacements.has(placement)) {
    throw validationError("Banner placement must be PARTY, HOT_TOP, or HOT_MID.");
  }
  return placement;
}

export function cleanSortOrder(value, { defaultValue = 0 } = {}) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const sortOrder = Number(value);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
    throw validationError("Sort order must be a whole number from 0 to 1000000.");
  }
  return sortOrder;
}

export function cleanBannerActionUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw validationError("Banner destination must be a valid HTTPS URL.");
  }
}

export function safeBannerActionUrl(value) {
  try {
    return cleanBannerActionUrl(value);
  } catch {
    return null;
  }
}

export function validateUploadAssetContract({ category, placement, mimeType }) {
  if (category === "BANNERS") {
    if (mimeType && !bannerMimeTypes.has(mimeType)) {
      throw validationError("Banners must be PNG, JPEG, or WebP images.");
    }
    return {
      placement: cleanBannerPlacement(placement, { required: true }),
    };
  }
  if (category === "ROOM_BACKGROUNDS" && mimeType && !roomBackgroundMimeTypes.has(mimeType)) {
    throw validationError("Room backgrounds must be PNG, JPEG, WebP, or MP4.");
  }
  if (category === "SEAT_STYLES" && mimeType && !seatStyleMimeTypes.has(mimeType)) {
    throw validationError("Seat styles must be PNG, JPEG, or WebP images.");
  }
  if (["PROFILE_DRESS", "MEDALS", "ROLE_ARTWORK", "AGENCY_ARTWORK"].includes(category) && mimeType && !["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"].includes(mimeType)) throw validationError("Profile artwork must be PNG, JPEG, WebP, GIF or MP4.");
  if (category === "BUSINESS_CARD" && mimeType && !businessCardMimeTypes.has(mimeType)) {
    throw validationError("Business cards must be PNG, JPEG, WebP, or MP4.");
  }
  if (category === "MUSIC_TRACKS" && mimeType && !musicTrackMimeTypes.has(mimeType)) {
    throw validationError("Music tracks must be MP3, M4A, AAC, OGG, or WAV audio files.");
  }
  if (String(placement ?? "").trim()) {
    throw validationError("Placement is only supported for banner assets.");
  }
  return { placement: null };
}

export function serializeUploadAsset(asset,url) {
  const assignedUsers=(asset.assignments??[]).map((assignment)=>({
    id:assignment.user.publicId,
    name:assignment.user.name,
    profileImage:assignment.user.profileImage,
    assignedAt:assignment.assignedAt?.toISOString()??null,
    durationMinutes:assignment.durationMinutes,
    expiresAt:assignment.expiresAt?.toISOString()??null,
    isExpired:Boolean(assignment.expiresAt&&assignment.expiresAt<=new Date()),
    source:assignment.source??"ADMIN",
    sourceReference:assignment.sourceReference??null,
    purchasePrice:assignment.purchasePrice?.toString()??null,
  }));
  return {
    id:asset.publicId,
    name:asset.name,
    details:asset.details,
    tags:asset.tags,
    category:asset.category,
    fileName:asset.fileName,
    mimeType:asset.mimeType,
    fileSize:asset.fileSize,
    url,
    posterUrl:asset.posterFileData?`${url}${url.includes("?")?"&":"?"}poster=1`:null,
    posterMimeType:asset.posterMimeType??null,
    posterFileSize:asset.posterFileSize??null,
    actionUrl:asset.category==="BANNERS"
      ? safeBannerActionUrl(asset.actionUrl)
      : asset.actionUrl,
    placement:asset.placement??null,
    sortOrder:asset.sortOrder??0,
    isGlobal:asset.isGlobal,
    isRoomBackground:asset.isRoomBackground,
    distribution:asset.distribution??"MANUAL",
    storeVisible:Boolean(asset.storeVisible),
    coinPrice:asset.coinPrice?.toString()??null,
      senderXp:String(asset.senderXp??0),
      receiverXp:String(asset.receiverXp??0),
    giftTier:asset.giftTier??null,
    minimumVipLevel:asset.minimumVipLevel??null,
    minimumRecharge:asset.minimumRecharge?.toString()??null,
    defaultGrantDurationMinutes:asset.defaultGrantDurationMinutes??null,
    active:asset.active??true,
    assignedUsers,
    assignedUser:assignedUsers[0]??null,
    createdAt:asset.createdAt.toISOString(),
    updatedAt:(asset.updatedAt??asset.createdAt).toISOString(),
  };
}

function assetSignature(assetId,userId,sessionVersion,expiresAt) {
  if(!process.env.AUTH_SECRET)throw new Error("AUTH_SECRET is required for signed asset URLs.");
  return createHmac("sha256",process.env.AUTH_SECRET).update(`${assetId}:${userId}:${sessionVersion}:${expiresAt}`).digest("base64url");
}

function publicDisplaySignature(assetId,expiresAt) {
  if(!process.env.AUTH_SECRET)throw new Error("AUTH_SECRET is required for signed asset URLs.");
  return createHmac("sha256",process.env.AUTH_SECRET).update(`display:${assetId}:${expiresAt}`).digest("base64url");
}

export function createSignedAssetUrl(origin,assetId,userId,sessionVersion,ttlSeconds=3600) {
  const expiresAt=Math.floor(Date.now()/1000)+ttlSeconds;
  const signature=assetSignature(assetId,userId,sessionVersion,expiresAt);
  const url=new URL(`/api/uploads/${assetId}/file`,origin);
  url.searchParams.set("uid",userId);
  url.searchParams.set("sv",String(sessionVersion));
  url.searchParams.set("exp",String(expiresAt));
  url.searchParams.set("sig",signature);
  return url.toString();
}

export function verifySignedAssetUrl(assetId,{userId,sessionVersion,expiresAt,signature}) {
  const version=Number(sessionVersion);
  const expiry=Number(expiresAt);
  if(!assetId||!userId||!Number.isInteger(version)||!Number.isInteger(expiry)||expiry<=Math.floor(Date.now()/1000)||!signature)return null;
  const expected=assetSignature(assetId,userId,version,expiry);
  const suppliedBuffer=Buffer.from(signature);
  const expectedBuffer=Buffer.from(expected);
  if(suppliedBuffer.length!==expectedBuffer.length||!timingSafeEqual(suppliedBuffer,expectedBuffer))return null;
  return {userId,sessionVersion:version,expiresAt:expiry};
}

export function createPublicDisplayAssetUrl(origin,assetId,ttlSeconds=3600) {
  const expiresAt=Math.floor(Date.now()/1000)+ttlSeconds;
  const url=new URL(`/api/uploads/${assetId}/file`,origin);
  url.searchParams.set("displayExp",String(expiresAt));
  url.searchParams.set("displaySig",publicDisplaySignature(assetId,expiresAt));
  return url.toString();
}

export function verifyPublicDisplayAssetUrl(assetId,{expiresAt,signature}) {
  const expiry=Number(expiresAt);
  if(!assetId||!Number.isInteger(expiry)||expiry<=Math.floor(Date.now()/1000)||!signature)return false;
  const expected=publicDisplaySignature(assetId,expiry);
  const suppliedBuffer=Buffer.from(signature);
  const expectedBuffer=Buffer.from(expected);
  return suppliedBuffer.length===expectedBuffer.length&&timingSafeEqual(suppliedBuffer,expectedBuffer);
}
import { createHmac, timingSafeEqual } from "node:crypto";
