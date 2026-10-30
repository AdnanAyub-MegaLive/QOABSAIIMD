import { perkMediaFields, namedDecoration } from "./decoration-media.js";
import { giftProgressSnapshot } from './gift-outbox-context.js';
import { resolveUserPerks } from "./user-perks.js";

export function giftSenderPayload(user, perks = null) {
  return {
    id: user.publicId,
    publicId: user.publicId,
    name: user.name,
    profileImage: user.profileImage ?? null,
    ...perkMediaFields(perks),
    frameUrl: perks?.frameUrl ?? null,
    badgeUrl: perks?.badgeUrl ?? null,
    chatBoxUrl: perks?.chatBoxUrl ?? null,
    level: Number.isSafeInteger(user.level) ? user.level : 0,
    vipLevel: Number.isSafeInteger(user.vipLevel) ? user.vipLevel : 0,
    anchorLevel: Number.isSafeInteger(user.anchorLevel) ? user.anchorLevel : 0,
    ...perks?.progression,
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

// Reuse the snapshots produced by this transaction, including both tracks for
// a self-gift. Unchanged tracks retain the artwork loaded before settlement.
export function settledGiftSender(sender, tx) {
  const result = { ...sender };
  const wealth = giftProgressSnapshot(tx, sender.publicId ?? sender.id, 'USER');
  const charm = giftProgressSnapshot(tx, sender.publicId ?? sender.id, 'CHARM');
  if (wealth) Object.assign(result, { level: wealth.level, userLevel: wealth.level, userLevelBadgeUrl: wealth.badgeUrl,
    ...namedDecoration('userLevelBackground', wealth.background) });
  if (charm) Object.assign(result, { charmLevel: charm.level, anchorLevel: charm.level, charmLevelBadgeUrl: charm.badgeUrl,
    ...namedDecoration('charmLevelBackground', charm.background) });
  return result;
}
