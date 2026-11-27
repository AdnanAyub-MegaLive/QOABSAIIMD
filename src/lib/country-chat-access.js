import { vipIsActive } from "./vip-contract.js";
export const COUNTRY_CHAT_NOTICE = "VIP 3 or above with Country Chat permission is required to send messages. You can still read the chat.";
export async function countryChatAccess(db, userId) {
  const membership = await db.vipMembership.findUnique({ where: { userId }, include: { tier: true } });
  const canSend = Boolean(vipIsActive(membership) && membership.tier.level >= 3 &&
    membership.tier.privileges.includes("COUNTRY_CHAT") && !(membership.disabledPrivileges ?? []).includes("COUNTRY_CHAT"));
  return { canSend, sendRestriction: canSend ? null : COUNTRY_CHAT_NOTICE };
}
export async function requireCountryChatSend(db, userId) {
  if (!(await countryChatAccess(db, userId)).canSend) throw Object.assign(new Error(COUNTRY_CHAT_NOTICE), {
    code: "COUNTRY_CHAT_VIP_REQUIRED", status: 403, validationMessage: COUNTRY_CHAT_NOTICE,
  });
}
