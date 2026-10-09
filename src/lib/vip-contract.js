// Stable capability keys; labels may change without breaking the mobile contract.
export const VIP_PRIVILEGES = [
  ["BADGE", "Badge", "BADGES"], ["ENTRANCE_STRIP", "Entrance strip", "TAIL_LIGHTS"],
  ["VIP_GIFTS", "VIP gifts", "GIFTS"], ["HIGHLIGHT_NAME", "Highlight name"],
  ["VIP_SEAT", "VIP seat", "SEAT_STYLES"], ["VIP_DATA_CARD", "VIP data card", "BUSINESS_CARD"],
  ["VIP_EMOJI", "VIP emoji", "VIP_STICKERS"], ["ANTI_MIC_BAN", "Anti-mic-ban"],
  ["ANTI_KICK", "Anti-kick"], ["VIP_LOGO", "VIP logo", "BADGES"],
  ["VIP_FRAME", "VIP frame", "FRAMES"], ["RANKING_PRIORITY", "Ranking priority"],
  ["VIP_ENTRANCE", "VIP entrance", "ENTRANCES"], ["CUSTOMER_SERVICE", "Exclusive customer service"],
  ["EVENT_CUSTOMIZATION", "Event customization"], ["FORBIDDEN_FOLLOW", "Forbidden to follow"],
  ["ROOM_ANTI_LOCK", "Room anti-lock"], ["INVISIBLE_ENTRY", "Enter room invisibly"],
  ["EXCLUSIVE_SEAT_STYLE", "Exclusive seat style", "SEAT_STYLES"],
  ["GIFT_AVATAR", "Gift avatar", "FRAMES"], ["CHAT_BACKGROUND", "Chat background", "CHAT_BOXES"],
  ["PROFILE_CARD", "Profile card", "BUSINESS_CARD"], ["GIF_ROOM_COVER", "GIF room cover"],
  ["LEVEL_BOOST", "Level boost"],
].map(([key,label,category])=>({key,label,category:category??null}));

export function validateVipTier(body) {
  const fail=message=>{throw Object.assign(new Error(message),{status:422,code:"VALIDATION_ERROR"});};
  if(typeof body.name!=="string" || !body.name.trim() || body.name.trim().length>80)fail("Name is required (maximum 80 characters).");
  const level=Number(body.level),validDays=Number(body.validDays);
  if(!Number.isSafeInteger(level)||level<1||level>2147483647)fail("VIP level must be a positive integer.");
  if(!Number.isSafeInteger(validDays)||validDays<1||validDays>3650)fail("Validity must be between 1 and 3650 days.");
  if(!Array.isArray(body.privileges)||body.privileges.some(key=>!VIP_PRIVILEGES.some(p=>p.key===key)))fail("Select supported privileges only.");
  const privileges=[...new Set(body.privileges)];
  const assets=body.assets??[];
  if(!Array.isArray(assets)||assets.length>100||assets.some(a=>!privileges.includes(a.privilege)||!VIP_PRIVILEGES.find(p=>p.key===a.privilege)?.category||typeof a.assetId!=="string"))fail("Artwork must belong to a selected artwork privilege.");
  for(const p of VIP_PRIVILEGES.filter(p=>p.category&&privileges.includes(p.key)))if(!assets.some(a=>a.privilege===p.key))fail(`Choose artwork for ${p.label}.`);
  return {name:body.name.trim(),level,validDays,active:body.active!==false,privileges,assets};
}

export function vipIsActive(membership,now=new Date()) {
  return Boolean(membership?.tier?.active && !membership.revokedAt && membership.startsAt<=now && membership.expiresAt>now);
}
