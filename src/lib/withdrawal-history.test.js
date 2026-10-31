import { PGlite } from "@electric-sql/pglite";
import { it, expect, vi } from "vitest";
vi.mock("./wallet.js", () => ({ serializeWithdrawal: row => ({ id: row.publicId }) }));
vi.mock("./currency-operations.js", () => ({ currencyRequestDto: row => ({ id: row.id }) }));
import { withdrawalHistory } from "./withdrawal-history.js";
it("merges current and legacy withdrawals without gaps across equal timestamps", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "WalletWithdrawal" (id TEXT, "userId" TEXT, "createdAt" TIMESTAMP);
      CREATE TABLE "CurrencyRequest" (id TEXT, "userId" TEXT, kind TEXT, "createdAt" TIMESTAMP);
      INSERT INTO "WalletWithdrawal" VALUES ('l1','me','2026-01-01'),('private','other','2027-01-01');
      INSERT INTO "CurrencyRequest" VALUES ('c2','me','USDT','2026-01-01'),('c1','me','USDT','2025-01-01'),('skip','me','REDEMPTION','2027-01-01');`);
    const db = { $queryRaw: async sql => (await pg.query(sql.text, sql.values)).rows,
      walletWithdrawal: { findMany: async ({ where }) => where.id.in.map(id => ({ id, publicId: `W-${id}` })) },
      currencyRequest: { findMany: async ({ where }) => where.id.in.map(id => ({ id })) } };
    const first = await withdrawalHistory(db, "me", new URLSearchParams({ limit: "1" }));
    expect(first.items).toEqual([{ id: "W-l1", historySource: "legacy" }]);
    const second = await withdrawalHistory(db, "me", new URLSearchParams({ limit: "1", cursor: first.nextCursor }));
    expect(second.items[0].id).toBe("c2");
    const third = await withdrawalHistory(db, "me", new URLSearchParams({ limit: "1", cursor: second.nextCursor }));
    expect(third.items[0].id).toBe("c1"); expect(third.nextCursor).toBeNull();
    await expect(withdrawalHistory(db, "other", new URLSearchParams({ cursor: first.nextCursor }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(withdrawalHistory(db, "me", new URLSearchParams({ cursor: first.nextCursor, q: "changed" }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  } finally { await pg.close(); }
});
