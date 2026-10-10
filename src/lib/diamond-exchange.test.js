import { describe, it, expect, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { exchangeQuote, exchangeDiamonds } from "./diamond-exchange.js";
const settings = { enabled: true, diamondsPerCoin: 3n, minDiamonds: 10n };
describe("diamond exchange", () => {
  it("rounds down and debits only used diamonds", () => {
    expect(exchangeQuote("10000", settings)).toEqual({ requested: 10000n, coins: 3333n, used: 9999n });
  });
  it("rejects invalid, below-minimum, zero-output and overflowing amounts", () => {
    for (const amount of ["0", "-1", "1.2", "1e4", "abc", "9223372036854775808"]) expect(() => exchangeQuote(amount, settings)).toThrow();
    expect(() => exchangeQuote("9", settings)).toThrow("EXCHANGE_BELOW_MINIMUM");
    expect(() => exchangeQuote("10", { ...settings, diamondsPerCoin: 11n })).toThrow("EXCHANGE_BELOW_MINIMUM");
  });
  function database(overrides = {}) {
    const user = { status: "ACTIVE", diamondExchangeEnabled: true, hostSalaryCoinBalance: 100n, coinBalance: 0n, ...overrides };
    const tx = { currencyPolicy: { findUnique: vi.fn(async () => ({version:1,rules:{userExchangeEnabled:true,userDiamondsPerCoin:"3",exchangeMinDiamonds:"10"}})) }, user: { findUniqueOrThrow: vi.fn(async () => user), update: vi.fn(async ({ data }) => ({ coinBalance: user.coinBalance + data.coinBalance.increment, hostSalaryCoinBalance: user.hostSalaryCoinBalance - data.hostSalaryCoinBalance.decrement })) }, walletTransaction: { findUnique: vi.fn(async () => null), createMany: vi.fn(async () => ({})) } };
    return { tx, $transaction: vi.fn(work => work(tx)) };
  }
  it("creates paired ledger entries and returns balances", async () => {
    const db = database();
    expect(await exchangeDiamonds("u", "10", "request-1", db)).toEqual({ diamonds: "91", coins: "3", exchangedDiamonds: "9", receivedCoins: "3" });
    const rows = db.tx.walletTransaction.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ direction: "DEBIT", diamonds: 9n, coins: null });
    expect(rows[1]).toMatchObject({ direction: "CREDIT", coins: 3n, diamonds: null });
    expect(rows[0].referenceId).toBe(rows[1].referenceId);
  });
  it("replays saved result without debiting and rejects a changed request", async () => {
    const db = database();
    db.tx.walletTransaction.findUnique.mockResolvedValue({ metadata: { requested: "10", result: { diamonds: "91", coins: "3" } } });
    expect(await exchangeDiamonds("u", "10", "request-1", db)).toEqual({ diamonds: "91", coins: "3" });
    expect(db.tx.user.update).not.toHaveBeenCalled();
    await expect(exchangeDiamonds("u", "11", "request-1", db)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("rejects disabled accounts and insufficient requested balances", async () => {
    await expect(exchangeDiamonds("u", "10", null, database({ diamondExchangeEnabled: false }))).rejects.toThrow("EXCHANGE_DISABLED");
    await expect(exchangeDiamonds("u", "101", null, database())).rejects.toThrow("INSUFFICIENT_DIAMONDS");
  });
  it("retries serialization conflicts", async () => {
    const db = database();
    db.$transaction.mockRejectedValueOnce({ code: "P2034" });
    await exchangeDiamonds("u", "10", "request-1", db);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
});
