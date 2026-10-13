export const serviceFields = ["MinDiamonds", "MaxDiamonds", "Multiple", "DailyLimit", "MonthlyLimit"];
export function serviceError(code, message, status = 422) { return Object.assign(new Error(message), { code, status }); }
export function diamondRules(policy, user, kind) {
  const r = policy.rules, host = Boolean(user.agencyId && (user.role === "HOST" || user.appRoles?.includes("HOST")));
  const prefix = kind === "TRANSFER" ? "transfer" : "exchange";
  const fields = Object.fromEntries(serviceFields.map(suffix => [suffix, r[prefix + suffix] ?? null]));
  const configured = policy.configured !== false && Object.values(fields).every(v => /^[1-9]\d*$/.test(String(v ?? "")));
  const rate = host ? r.hostDiamondsPerCoin : r.userDiamondsPerCoin;
  let reason = null;
  if (!configured || (kind === "EXCHANGE" && !/^[1-9]\d*$/.test(String(rate ?? "")))) reason = "Configuration is incomplete. Contact support.";
  else if (kind === "TRANSFER" ? !r.hostTransferEnabled : !(host ? r.hostExchangeEnabled : r.userExchangeEnabled)) reason = `${kind === "TRANSFER" ? "Diamond Transfer" : "Diamond Exchange"} is disabled.`;
  else if (user.status !== "ACTIVE" || user.deletedAt) reason = "Your account is not eligible.";
  else if (kind === "TRANSFER" && (!host || !user.country)) reason = "An agency-linked host account with a selected country is required.";
  else if (kind === "EXCHANGE" && (user.appRoles?.includes("RESELLER") || user.diamondExchangeEnabled === false)) reason = "Exchange is unavailable for this account.";
  return { enabled: !reason, reason, policyVersion: policy.version, minDiamonds: fields.MinDiamonds, maxDiamonds: fields.MaxDiamonds, amountMultiple: fields.Multiple, dailyLimit: fields.DailyLimit, monthlyLimit: fields.MonthlyLimit, feeDiamonds: "0", feeBps: 0, periodTimezone: "UTC", ...(kind === "EXCHANGE" ? { diamondsPerCoin: rate || null } : {}) };
}
export function validateServiceAmount(value, rules, kind) {
  if (!rules.enabled) throw serviceError(`${kind}_DISABLED`, rules.reason, 403);
  if (value < BigInt(rules.minDiamonds)) throw serviceError(`${kind}_BELOW_MINIMUM`, "Amount is below the minimum.");
  if (value > BigInt(rules.maxDiamonds)) throw serviceError(`${kind}_ABOVE_MAXIMUM`, "Amount exceeds the maximum.");
  if (value % BigInt(rules.amountMultiple)) throw serviceError(`${kind}_INVALID_MULTIPLE`, `Amount must be a multiple of ${rules.amountMultiple} Diamonds.`);
}
export async function checkDiamondLimits(tx, userId, value, rules, kind, now = new Date()) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Existing immutable debits are the authoritative usage source, including pre-policy history.
  const where = { userId, direction: "DEBIT", type: kind === "TRANSFER" ? "TRANSFER_SENT" : "DIAMOND_EXCHANGE_DEBIT", diamonds: { not: null } };
  for (const [start, limit, code] of [[day, rules.dailyLimit, "DAILY"], [month, rules.monthlyLimit, "MONTHLY"]]) {
    const sum = await tx.walletTransaction.aggregate({ where: { ...where, createdAt: { gte: start } }, _sum: { diamonds: true } });
    if ((sum._sum.diamonds ?? 0n) + value > BigInt(limit)) throw serviceError(`${kind}_${code}_LIMIT`, `${code === "DAILY" ? "Daily" : "Monthly"} Diamond limit exceeded.`, 409);
  }
}
export function eligibleResellerWhere(user, now = new Date()) {
  return { id: { not: user.id }, country: user.country || "__NO_COUNTRY__", status: "ACTIVE", deletedAt: null, appRoles: { has: "RESELLER" }, bans: { none: { target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } };
}
export const activeSpecialIdWhere = (now = new Date()) => ({ status: "ACTIVE", revokedAt: null, startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });
