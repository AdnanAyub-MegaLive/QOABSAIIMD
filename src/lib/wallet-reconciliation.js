function signedAmount(value, direction) {
  if (value == null) return 0n;
  return direction === "DEBIT" ? -BigInt(value) : BigInt(value);
}

export function reconcileWalletBalances(user, transactions) {
  const settledTransactions = transactions.filter((transaction) =>
    ["COMPLETED", "PENDING"].includes(transaction.status),
  );
  const ledgerCoins = settledTransactions.reduce(
    (total, transaction) => total + (transaction.metadata?.wallet === "BUSINESS" ? 0n : signedAmount(transaction.coins, transaction.direction)),
    0n,
  );
  const ledgerSalaryCoins = settledTransactions.reduce(
    (total, transaction) => total + signedAmount(transaction.diamonds, transaction.direction),
    0n,
  );
  const ledgerBusinessCoins = settledTransactions.reduce((total, transaction) => total + (transaction.metadata?.wallet === "BUSINESS" ? signedAmount(transaction.coins, transaction.direction) : 0n), 0n);
  return reconcileWalletTotals(user, { ledgerCoins, ledgerSalaryCoins, ledgerBusinessCoins });
}

export function reconcileWalletTotals(user, { ledgerCoins, ledgerSalaryCoins, ledgerBusinessCoins }) {
  ledgerCoins = BigInt(ledgerCoins);
  ledgerSalaryCoins = BigInt(ledgerSalaryCoins);
  ledgerBusinessCoins = BigInt(ledgerBusinessCoins);
  const businessDifference = BigInt(user.resellerCoinBalance ?? 0n) - ledgerBusinessCoins;
  const coinsDifference = BigInt(user.coinBalance) - ledgerCoins;
  const salaryDifference = BigInt(user.hostSalaryCoinBalance) - ledgerSalaryCoins;
  return {
    userId: user.publicId,
    balanceCoins: BigInt(user.coinBalance).toString(),
    balanceSalaryCoins: BigInt(user.hostSalaryCoinBalance).toString(),
    ledgerCoins: ledgerCoins.toString(),
    ledgerSalaryCoins: ledgerSalaryCoins.toString(),
    coinsDifference: coinsDifference.toString(),
    salaryDifference: salaryDifference.toString(),
    balanceBusinessCoins: String(user.resellerCoinBalance ?? 0n),
    ledgerBusinessCoins: String(ledgerBusinessCoins),
    businessDifference: String(businessDifference),
    status:
      coinsDifference === 0n && salaryDifference === 0n && businessDifference === 0n
        ? "MATCHED"
        : "REQUIRES_BASELINE_OR_INVESTIGATION",
  };
}

// One read-only statement gives balances and COMPLETE ledger totals from the
// same PostgreSQL snapshot. UI history pagination never limits reconciliation.
export async function readWalletReconciliation(db, publicId = null) {
  const rows = await db.$queryRaw`
    SELECT u."publicId", u."name", u."coinBalance", u."hostSalaryCoinBalance", u."resellerCoinBalance",
      COALESCE(SUM(CASE WHEN t.metadata->>'wallet' = 'BUSINESS' THEN 0 ELSE
        CASE WHEN t.direction = 'DEBIT' THEN -COALESCE(t.coins, 0)::numeric ELSE COALESCE(t.coins, 0)::numeric END END), 0)::text AS "ledgerCoins",
      COALESCE(SUM(CASE WHEN t.metadata->>'wallet' = 'BUSINESS' THEN
        CASE WHEN t.direction = 'DEBIT' THEN -COALESCE(t.coins, 0)::numeric ELSE COALESCE(t.coins, 0)::numeric END ELSE 0 END), 0)::text AS "ledgerBusinessCoins",
      COALESCE(SUM(CASE WHEN t.direction = 'DEBIT' THEN -COALESCE(t.diamonds, 0)::numeric ELSE COALESCE(t.diamonds, 0)::numeric END), 0)::text AS "ledgerSalaryCoins"
    FROM "User" u LEFT JOIN "WalletTransaction" t ON t."userId" = u.id AND t.status IN ('COMPLETED', 'PENDING')
    WHERE u."deletedAt" IS NULL AND (${publicId}::text IS NULL OR u."publicId" = ${publicId}::text)
    GROUP BY u.id ORDER BY u."publicId"`;
  return rows.map(row => ({ ...reconcileWalletTotals(row, row), name: row.name }));
}
