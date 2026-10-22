import { expect, it, vi } from "vitest";
import { financeRecords } from "./finance-records.js";
it("applies pending status and search before paging, with stable oldest-first order", async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  await financeRecords({ walletWithdrawal: { findMany } }, new URLSearchParams("kind=withdrawals&q=old-user"));
  expect(findMany.mock.lastCall[0]).toMatchObject({ take: 51, orderBy: [{ createdAt: "asc" }, { id: "asc" }], where: { AND: [{ status: { in: ["PENDING", "APPROVED"] } }, { OR: expect.any(Array) }, {}] } });
});
it("returns full precision ledger strings and a cursor for older history", async () => {
  const row = { id: "internal-a", publicId: "ledger-a", createdAt: new Date(0), coins: 9007199254740993n, user: { name: "Test", publicId: "USR-test" } };
  const findMany = vi.fn().mockResolvedValue([row, { ...row, id: "internal-b" }]);
  const result = await financeRecords({ walletTransaction: { findMany } }, new URLSearchParams("kind=ledger&limit=1"));
  expect(result.items[0].coins).toBe("9007199254740993"); expect(result.nextCursor).toBeTruthy();
  await financeRecords({ walletTransaction: { findMany } }, new URLSearchParams({ kind: "ledger", cursor: result.nextCursor }));
  expect(findMany.mock.lastCall[0].where.AND[2].OR[1].id).toEqual({ lt: "internal-a" });
});
it("rejects unsupported kinds and status before accessing the database", async () => {
  await expect(financeRecords({}, new URLSearchParams("kind=unknown"))).rejects.toMatchObject({ status: 422 });
  await expect(financeRecords({}, new URLSearchParams("kind=ledger&status=APPROVED"))).rejects.toMatchObject({ status: 422 });
});
