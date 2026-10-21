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
export function fixedGiftDiamonds(perUnit, quantity) {
  return perUnit == null ? null : BigInt(perUnit) * BigInt(quantity);
}

export function calculateGiftSettlement(gross, host, policy, currency, requestedReward = 0n, options = {}) {
  const agencyCoins = host ? coinsForShare(gross, policy.agencyShareBps) : 0n;
  let recipientCoins = host ? coinsForShare(gross, policy.hostShareBps) : coinsForShare(gross, policy.normalUserReusableShareBps);
  let receivedDiamonds = null;
  if (options.fixedDiamonds != null) {
    const numerator = BigInt(currency.rules.giftDiamondsNumerator), denominator = BigInt(currency.rules.giftCoinsDenominator);
    const room = gross - agencyCoins;
    const wanted = BigInt(options.fixedDiamonds);
    const wantedCoins = (wanted * denominator + numerator - 1n) / numerator;
    recipientCoins = wantedCoins > room ? room : wantedCoins;
    receivedDiamonds = wantedCoins > room ? (room * numerator) / denominator : wanted;
  }
  const hostSalaryCoins = host ? recipientCoins : 0n;
  const reusableCoins = host ? 0n : recipientCoins;
  const available = gross - hostSalaryCoins - agencyCoins - reusableCoins;
  if (gross < 0n || available < 0n || requestedReward < 0n) throw new Error("Invalid gift settlement policy.");
  const luckyPoolCoins = options.luckyPoolBps == null ? 0n : (() => { const share = coinsForShare(gross, options.luckyPoolBps); return share > available ? available : share; })();
  const remaining = available - luckyPoolCoins;
  const luckyRewardCoins = requestedReward > remaining ? remaining : requestedReward;
  return { hostSalaryCoins, agencyCoins, reusableCoins, companyCoins: remaining - luckyRewardCoins, luckyPoolCoins,
    luckyRewardCoins, receivedDiamonds: receivedDiamonds ?? giftDiamonds(gross, hostSalaryCoins + reusableCoins, currency) };
}
