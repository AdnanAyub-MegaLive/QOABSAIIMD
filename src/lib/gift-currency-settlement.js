import { giftDiamonds } from "./currency-policy.js";
import { coinsForShare } from "./profit-rules.js";

export async function assertGiftRecipient(tx, recipient) {
  const current = recipient && await tx.user.findFirst({where:{id:recipient.id,deletedAt:null,status:"ACTIVE"}});
  if (!current) throw Object.assign(new Error("The recipient account is unavailable."), {code:"USER_NOT_FOUND"});
  if (current.agencyId !== recipient.agencyId || current.appRoles.includes("HOST") !== recipient.appRoles.includes("HOST"))
    throw Object.assign(new Error("Recipient membership changed. Please retry."), {code:"GIFT_RECIPIENT_CHANGED"});
  if (current.appRoles.includes("HOST") && !current.agencyId)
    throw Object.assign(new Error("Hosts must belong to an agency."), {code:"HOST_AGENCY_REQUIRED"});
}

// All gift sources use the same integer, per-recipient settlement calculation.
// Coin allocations describe platform accounting; recipients always receive Diamonds.
export function calculateGiftSettlement(gross, host, policy, currency, requestedReward = 0n) {
  const hostSalaryCoins = host ? coinsForShare(gross, policy.hostShareBps) : 0n;
  const agencyCoins = host ? coinsForShare(gross, policy.agencyShareBps) : 0n;
  const reusableCoins = host ? 0n : coinsForShare(gross, policy.normalUserReusableShareBps);
  const available = gross - hostSalaryCoins - agencyCoins - reusableCoins;
  if (gross < 0n || available < 0n || requestedReward < 0n) throw new Error("Invalid gift settlement policy.");
  const luckyRewardCoins = requestedReward > available ? available : requestedReward;
  return { hostSalaryCoins, agencyCoins, reusableCoins, companyCoins: available - luckyRewardCoins,
    luckyRewardCoins, receivedDiamonds: giftDiamonds(gross, hostSalaryCoins + reusableCoins, currency) };
}
