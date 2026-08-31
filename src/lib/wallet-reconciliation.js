function signedAmount(value, direction) {
  if (value == null) return 0n;
  return direction === "DEBIT" ? -BigInt(value) : BigInt(value);
}

export function reconcileWalletBalances(user, transactions) {
  const settledTransactions = transactions.filter((transaction) =>
    ["COMPLETED", "PENDING"].includes(transaction.status),
  );
  const ledgerCoins = settledTransactions.reduce(
    (total, transaction) => total + signedAmount(transaction.coins, transaction.direction),
    0n,
  );
  const ledgerSalaryCoins = settledTransactions.reduce(
    (total, transaction) => total + signedAmount(transaction.diamonds, transaction.direction),
    0n,
  );
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
    status:
      coinsDifference === 0n && salaryDifference === 0n
        ? "MATCHED"
        : "REQUIRES_BASELINE_OR_INVESTIGATION",
  };
}
