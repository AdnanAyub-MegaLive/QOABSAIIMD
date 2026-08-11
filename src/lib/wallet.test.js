import { describe, expect, it } from "vitest";
import {
  packageAmounts,
  parsePositiveCoins,
  serializePackage,
  serializeWalletTransaction,
} from "./wallet";

describe("wallet helpers", () => {
  it("calculates package bonuses without trusting the client", () => {
    const item = {
      id: "COIN_25000",
      coins: 25000n,
      bonusPercent: 20,
      price: { toString: () => "1050" },
      bestValue: true,
      active: true,
    };
    expect(packageAmounts(item)).toEqual({ bonusCoins: 5000n, totalCoins: 30000n });
    expect(serializePackage(item)).toMatchObject({ bonusCoins: "5000", totalCoins: "30000", price: "1050" });
  });

  it("accepts only positive integer coin amounts", () => {
    expect(parsePositiveCoins("500")).toBe(500n);
    expect(() => parsePositiveCoins("1.5")).toThrow("positive integer");
    expect(() => parsePositiveCoins("-1")).toThrow("positive integer");
  });

  it("serializes large ledger values as strings", () => {
    const result = serializeWalletTransaction({
      publicId: "TXN-1",
      type: "COIN_TOP_UP",
      direction: "CREDIT",
      title: "Coins package",
      description: null,
      coins: 9007199254740993n,
      diamonds: null,
      cashAmount: { toString: () => "1050.00" },
      currency: "PKR",
      status: "COMPLETED",
      createdAt: new Date("2026-08-10T12:00:00.000Z"),
    });
    expect(result.coins).toBe("9007199254740993");
    expect(result.amount).toBe("1050.00");
  });
});
