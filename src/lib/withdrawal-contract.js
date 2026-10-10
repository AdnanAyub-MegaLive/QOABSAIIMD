import { createHmac, timingSafeEqual } from "node:crypto";
import { amount, currencyError } from "./currency-policy.js";

export function payoutConfiguration(policy) {
  const r = policy?.rules ?? {};
  try {
    if (policy?.configured === false) throw new Error();
    for (const key of ["withdrawalDiamondsPerUsd", "usdtMicrosPerUsd", "withdrawalMinDiamonds", "withdrawalMaxDiamonds"]) amount(r[key]);
    if (amount(r.withdrawalMinDiamonds) > amount(r.withdrawalMaxDiamonds) || !["HOST", "COMPANY"].includes(r.feeBearer)) throw new Error();
    if (!Array.isArray(r.commissionChart) || !r.commissionChart.length || r.commissionChart.length > 30) throw new Error();
    let last = -1n;
    for (const row of r.commissionChart) {
      const min = amount(row.minUsdMicros, true);
      if (min <= last || (last === -1n && min !== 0n) || amount(row.bps, true) > 10000n) throw new Error();
      amount(row.fixedUsdtMicros, true); amount(row.networkUsdtMicros, true); last = min;
    }
    return true;
  } catch { return false; }
}

export function withdrawalAvailability(user, policy) {
  const configured = payoutConfiguration(policy);
  const eligible = user.status === "ACTIVE" && !user.deletedAt && Boolean(user.agencyId && (user.role === "HOST" || user.appRoles?.includes("HOST")));
  const reason = !eligible ? { code: "WITHDRAWAL_NOT_ALLOWED", message: "Only an active agency-linked host can request salary withdrawals." }
    : !configured ? { code: "PAYOUT_CONFIGURATION_INCOMPLETE", message: "Withdrawals are unavailable while the platform completes payout rates, limits and fees." }
    : policy.rules.usdtEnabled !== true ? { code: "WITHDRAWAL_DISABLED", message: "The platform has disabled withdrawals." }
    : BigInt(user.hostSalaryCoinBalance ?? 0) < BigInt(policy.rules.withdrawalMinDiamonds) ? { code: "INSUFFICIENT_DIAMONDS", message: "Your available Diamonds are below the minimum withdrawal amount." } : null;
  return { canWithdraw: !reason, accountEligible: eligible, configured, enabled: policy?.rules?.usdtEnabled === true,
    reason, method: "USDT_TRC20", currency: "USDT", network: "TRC20", policyVersion: policy.version };
}

export function issueWithdrawalQuote({ userId, diamonds, destination, policyVersion }, now = Date.now()) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required.");
  const expiresAt = new Date(now + 10 * 60_000).toISOString();
  const payload = Buffer.from(JSON.stringify({ purpose: "withdrawal", userId, diamonds: String(diamonds), destination, policyVersion, expiresAt })).toString("base64url");
  const sig = createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
  return { quoteToken: `${payload}.${sig}`, expiresAt };
}

export function verifyWithdrawalQuote(token, expected, now = Date.now()) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required.");
  try {
    if (typeof token !== "string" || token.length > 2048) throw new Error();
    const [payload, signature, extra] = token.split(".");
    const expectedSig = createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest();
    const sig = Buffer.from(signature, "base64url");
    if (extra || sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) throw new Error();
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (value.purpose !== "withdrawal" || !(Date.parse(value.expiresAt) > now) || value.userId !== expected.userId
      || value.diamonds !== String(expected.diamonds) || value.destination !== expected.destination || value.policyVersion !== expected.policyVersion) throw new Error();
  } catch { throw currencyError("Request a new payout quote and confirm it before submitting.", "CURRENCY_QUOTE_EXPIRED"); }
}
