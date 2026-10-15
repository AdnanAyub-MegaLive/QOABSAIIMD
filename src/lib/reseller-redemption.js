import { amount, currencyError } from "./currency-policy.js";

export function redemptionCoins(diamonds, rules) {
  const numerator = amount(rules.redemptionCoinsNumerator ?? "1");
  const denominator = amount(rules.redemptionDiamondsPerCoin);
  const deduction = amount(rules.redemptionDeductionBps, true);
  if (deduction > 10000n) throw currencyError("Invalid redemption deduction.");
  return diamonds * numerator * (10000n - deduction) / (denominator * 10000n);
}

// Conservative provenance: only newly verified host transfers qualify. Every
// Diamond debit consumes eligible funds first; unrelated credits never replenish it.
export async function redeemableHostDiamonds(tx, userId) {
  let available = 0n, cursor;
  for (;;) {
    const rows = await tx.walletTransaction.findMany({
      where: { userId, diamonds: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, direction: true, type: true, diamonds: true, metadata: true },
    });
    for (const row of rows) {
      if (row.direction === "DEBIT") available = available > row.diamonds ? available - row.diamonds : 0n;
      else if (row.type === "TRANSFER_RECEIVED" && row.metadata?.verifiedHostTransfer === true) available += row.diamonds;
      else if (row.type === "REFUND" && row.metadata?.restoredHostDiamonds) available += amount(row.metadata.restoredHostDiamonds, true);
    }
    if (rows.length < 500) return available;
    cursor = rows.at(-1).id;
  }
}
