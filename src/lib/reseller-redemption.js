import { amount, currencyError } from "./currency-policy.js";

export function redemptionCoins(diamonds, rules) {
  const numerator = amount(rules.redemptionCoinsNumerator ?? "1");
  const denominator = amount(rules.redemptionDiamondsPerCoin);
  const deduction = amount(rules.redemptionDeductionBps, true);
  if (deduction > 10000n) throw currencyError("Invalid redemption deduction.");
  return diamonds * numerator * (10000n - deduction) / (denominator * 10000n);
}

// Reconstruct both sources from the same ordered ledger, including historical gifts.
export async function resellerDiamondBalances(tx, userId) {
  let gift = 0n, transferred = 0n, cursor;
  const reservations = new Map();
  for (;;) {
    const rows = await tx.walletTransaction.findMany({
      where: { userId, diamonds: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, referenceId: true, direction: true, type: true, diamonds: true, metadata: true },
    });
    for (const row of rows) {
      const value = row.diamonds;
      if (row.direction === "DEBIT") {
        // Older, unlabelled spending already consumed transferred Diamonds first.
        const business = row.metadata?.diamondSource === "GIFT" ? 0n : (transferred < value ? transferred : value);
        const personal = gift < value - business ? gift : value - business;
        transferred -= business;
        gift -= personal;
        if (row.referenceId && ["WITHDRAWAL", "TRANSFER_SENT", "DIAMOND_EXCHANGE_DEBIT"].includes(row.type) && row.metadata?.diamondSource !== "GIFT")
          reservations.set(row.referenceId, { business, personal });
      } else if (row.type === "GIFT_RECEIVED") {
        gift += value;
      } else if (row.type === "TRANSFER_RECEIVED" && row.metadata?.verifiedHostTransfer === true) {
        transferred += value;
      } else if (row.type === "REFUND") {
        const reservation = reservations.get(row.referenceId);
        transferred += reservation?.business ?? BigInt(row.metadata?.restoredHostDiamonds ?? 0);
        gift += reservation?.personal ?? 0n;
        reservations.delete(row.referenceId);
      }
    }
    if (rows.length < 500) return { gift, transferred };
    cursor = rows.at(-1).id;
  }
}

export async function redeemableHostDiamonds(tx, userId) {
  return (await resellerDiamondBalances(tx, userId)).transferred;
}
