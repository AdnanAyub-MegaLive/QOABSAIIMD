import { describe, it, expect, vi } from "vitest";
import { walletHistorySearch } from "./wallet-history-search.js";
const user = { id: "me", publicId: "USR-me" };
describe("wallet history search", () => {
  it("keeps empty search free of extra queries", async () => {
    const db = { $queryRaw: vi.fn() };
    expect(await walletHistorySearch(db, "transactions", "", user)).toEqual({});
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("binds search text and ownership and returns a bounded ID page", async () => {
    const db = { $queryRaw: vi.fn(async () => [{ id: "match" }]) };
    expect(await walletHistorySearch(db, "transactions", "' OR TRUE --", user, "cursor", 20)).toEqual({ id: { in: ["match"] } });
    const sql = db.$queryRaw.mock.calls[0][0];
    expect(sql.text).not.toContain("' OR TRUE --");
    expect(sql.values).toContain("me");
    expect(sql.values).toContain(21);
    expect(sql.text).toContain('h."createdAt", h.id');
  });
  it("rejects oversized queries", async () => {
    await expect(walletHistorySearch({}, "currency", "x".repeat(121), user)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
