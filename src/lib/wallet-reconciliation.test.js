import { describe, expect, it } from "vitest";
import { reconcileWalletBalances } from "./wallet-reconciliation";

describe("reconcileWalletBalances", () => {
  it("matches balances against signed immutable ledger entries", () => {
    const result = reconcileWalletBalances(
      { publicId: "USR-1", coinBalance: 70n, hostSalaryCoinBalance: 40n },
      [
        { status: "COMPLETED", direction: "CREDIT", coins: 100n, diamonds: null },
        { status: "COMPLETED", direction: "DEBIT", coins: 30n, diamonds: null },
        { status: "PENDING", direction: "CREDIT", coins: null, diamonds: 40n },
      ],
    );
    expect(result).toMatchObject({ status: "MATCHED", ledgerCoins: "70", ledgerSalaryCoins: "40" });
  });

  it("flags accounts that need a verified opening balance or investigation", () => {
    const result = reconcileWalletBalances(
      { publicId: "USR-2", coinBalance: 25n, hostSalaryCoinBalance: 0n },
      [],
    );
    expect(result).toMatchObject({ status: "REQUIRES_BASELINE_OR_INVESTIGATION", coinsDifference: "25" });
  });
});
