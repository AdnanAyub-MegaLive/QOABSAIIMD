import { resolveUserPerks } from "./user-perks.js";

export function giftSenderPayload(user, perks = null) {
  return {
    id: user.publicId,
    publicId: user.publicId,
    name: user.name,
    profileImage: user.profileImage ?? null,
    frameUrl: perks?.frameUrl ?? null,
    badgeUrl: perks?.badgeUrl ?? null,
    chatBoxUrl: perks?.chatBoxUrl ?? null,
    level: Number.isSafeInteger(user.level) ? user.level : 0,
    vipLevel: Number.isSafeInteger(user.vipLevel) ? user.vipLevel : 0,
    anchorLevel: Number.isSafeInteger(user.anchorLevel) ? user.anchorLevel : 0,
  };
}

export async function resolveGiftSender(user, origin) {
  try {
    const perks = (await resolveUserPerks([user], origin, ["FRAMES", "BADGES", "CHAT_BOXES"])).get(user.publicId);
    return giftSenderPayload(user, perks);
  } catch (error) {
    console.error("Gift sender perks resolution failed", error);
    return giftSenderPayload(user);
  }
}
