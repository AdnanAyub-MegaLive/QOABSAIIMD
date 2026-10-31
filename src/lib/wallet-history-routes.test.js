import { beforeEach, it, expect, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: { walletTransaction: { findFirst: vi.fn(), findMany: vi.fn() }, walletWithdrawal: { findFirst: vi.fn(), findMany: vi.fn() }, currencyRequest: { findFirst: vi.fn(), findMany: vi.fn() }, user: { findMany: vi.fn() } } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/mobile-api", () => ({ requireMobileUser: async () => ({ id: "me", publicId: "USR-me" }), mobileOptions: () => {}, mobileJson: Response.json, mobileApiError: e => Response.json({ code: e.code }, { status: 400 }) }));
vi.mock("@/lib/wallet", () => ({ serializeWalletTransaction: row => row, serializeWithdrawal: row => row }));
vi.mock("@/lib/currency-operations", () => ({ currencyRequestDto: row => row, createCurrencyRequest: vi.fn(), updateOwnCurrencyRequest: vi.fn() }));
import { GET as transactions } from "../app/api/wallet/transactions/route.js";
import { GET as withdrawals } from "../app/api/wallet/withdrawals/route.js";
import { GET as currency } from "../app/api/wallet/currency-requests/route.js";
beforeEach(() => {
  vi.clearAllMocks(); db.user.findMany.mockResolvedValue([]);
  for (const model of [db.walletTransaction, db.walletWithdrawal, db.currencyRequest]) { model.findFirst.mockResolvedValue(null); model.findMany.mockResolvedValue([]); }
});
it.each([[transactions, "walletTransaction"], [withdrawals, "walletWithdrawal"], [currency, "currencyRequest"]])("keeps ownership outside search OR filters", async (handler, model) => {
  expect((await handler(new Request("https://portal.test/api/wallet/history?q=completed"))).status).toBe(200);
  const where = db[model].findMany.mock.calls[0][0].where;
  expect(where.AND[0]).toEqual(model === "currencyRequest" ? { OR: [{ userId: "me" }, { recipientPublicId: "USR-me" }] } : { userId: "me" });
  expect(where.AND[1].OR.length).toBeGreaterThan(0);
});
it.each([[transactions, "walletTransaction"], [withdrawals, "walletWithdrawal"], [currency, "currencyRequest"]])("rejects another account's cursor before fetching records", async (handler, model) => {
  expect((await handler(new Request("https://portal.test/api/wallet/history?cursor=other&q=pending"))).status).toBe(400);
  expect(db[model].findMany).not.toHaveBeenCalled();
});
it("retains pagination for filtered results", async () => {
  db.walletTransaction.findMany.mockResolvedValue([{ publicId: "T1" }, { publicId: "T2" }]);
  const result = await (await transactions(new Request("https://portal.test/api/wallet/history?q=gift&limit=1"))).json();
  expect(result.data).toEqual({ transactions: [{ publicId: "T1" }], nextCursor: "T1" });
});
