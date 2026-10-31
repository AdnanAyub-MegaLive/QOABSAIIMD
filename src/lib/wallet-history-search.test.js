import { describe, it, expect, vi } from "vitest";
import { walletHistorySearch } from "./wallet-history-search.js";
const db = () => ({ user: { findMany: vi.fn(async () => []) }, currencyRequest: { findMany: vi.fn(async () => []) } });
describe("wallet history search", () => {
  it("preserves the no-search path without extra queries", async () => {
    const store = db(); expect(await walletHistorySearch(store, "transactions", " ")).toEqual({}); expect(store.user.findMany).not.toHaveBeenCalled();
  });
  it("matches case-insensitive enum fragments and text", async () => {
    const result = await walletHistorySearch(db(), "transactions", "gift");
    expect(result.OR).toContainEqual({ type: { in: ["LUCKY_GIFT_REWARD", "GIFT_SENT", "GIFT_RECEIVED", "STORE_GIFT_SENT", "STORE_GIFT_RECEIVED"] } });
    expect(result.OR).toContainEqual({ title: { contains: "gift", mode: "insensitive" } });
  });
  it("keeps exact large amounts without floating point loss", async () => {
    const result = await walletHistorySearch(db(), "transactions", "9007199254740993");
    expect(result.OR).toContainEqual({ diamonds: 9007199254740993n });
  });
  it("resolves counterparties by active special ID", async () => {
    const store = db(); store.user.findMany.mockResolvedValue([{ id: "u", publicId: "USR-1" }]);
    const result = await walletHistorySearch(store, "currency", "SPECIAL");
    expect(result.OR).toContainEqual({ recipientPublicId: { in: ["USR-1"] } });
    expect(store.user.findMany.mock.calls[0][0].where.OR[2].specialIds.some.specialId).toEqual({ contains: "SPECIAL", mode: "insensitive" });
  });
  it("rejects oversized queries", async () => { await expect(walletHistorySearch(db(), "currency", "x".repeat(121))).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); });
});
