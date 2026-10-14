import { expect, it, vi } from "vitest";
import { createCurrencyRequest } from "./currency-operations.js";

function database() {
  const sender = { id: "u", publicId: "TLN-1", status: "ACTIVE", country: "PK", agencyId: "a", appRoles: ["HOST"] };
  const recipient = { id: "r", publicId: "USR-2", country: "PK" };
  const tx = {
    notification: { upsert: vi.fn(async () => ({})) },
    currencyRequest: { findUnique: vi.fn(async () => null), create: vi.fn(async ({ data }) => ({ id: "request", ...data })) },
    currencyPolicy: { findUnique: vi.fn(async () => ({ version: 1, rules: { hostTransferEnabled: true, transferMinDiamonds: "10", transferMaxDiamonds: "100", transferMultiple: "5", transferDailyLimit: "200", transferMonthlyLimit: "500" } })) },
    user: { findUniqueOrThrow: vi.fn(async () => sender), findFirst: vi.fn(async () => recipient), updateMany: vi.fn(async () => ({ count: 1 })) },
    walletTransaction: { aggregate: vi.fn(async () => ({ _sum: { diamonds: 0n } })), create: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { tx, $transaction: vi.fn(work => work(tx)) };
}
const input = { kind: "RESELLER_TRANSFER", diamonds: "50", recipientPublicId: "USR-2" };
it("credits the reseller the full submitted amount with no fee", async () => {
  const db = database();
  const row = await createCurrencyRequest(db, "u", input, "request-1");
  expect(row.diamonds).toBe("50");
  expect(db.tx.user.updateMany.mock.calls[0][0].data.hostSalaryCoinBalance).toEqual({ decrement: 50n });
  expect(db.tx.user.updateMany.mock.calls[1][0].data.hostSalaryCoinBalance).toEqual({ increment: 50n });
  expect(db.tx.walletTransaction.create).toHaveBeenCalledTimes(2);
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
});
it("rejects a different country before any debit", async () => {
  const db = database();
  db.tx.user.findFirst.mockResolvedValue({ id: "r", country: "DE" });
  await expect(createCurrencyRequest(db, "u", input, "request-1")).rejects.toMatchObject({ code: "TRANSFER_COUNTRY_MISMATCH" });
  expect(db.tx.user.updateMany).not.toHaveBeenCalled();
});
it("rechecks eligibility and rejects an ineligible reseller before debit", async () => {
  const db = database();
  db.tx.user.findFirst.mockResolvedValueOnce({ id: "r", country: "PK" }).mockResolvedValueOnce(null);
  await expect(createCurrencyRequest(db, "u", input, "request-1")).rejects.toMatchObject({ code: "RESELLER_INELIGIBLE" });
  expect(db.tx.user.findFirst.mock.calls[1][0].where.AND[0]).toMatchObject({ country: "PK", id: { not: "u" }, deletedAt: null, status: "ACTIVE" });
  expect(db.tx.user.updateMany).not.toHaveBeenCalled();
});
it("replays current status without another debit and rejects conflicting retries", async () => {
  const db = database();
  const row = await createCurrencyRequest(db, "u", input, "request-1");
  db.tx.currencyRequest.findUnique.mockResolvedValue({ ...row, status: "COMPLETED" });
  db.tx.user.updateMany.mockClear();
  expect((await createCurrencyRequest(db, "u", input, "request-1")).status).toBe("COMPLETED");
  await expect(createCurrencyRequest(db, "u", { ...input, diamonds: "55" }, "request-1")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(db.tx.user.updateMany).not.toHaveBeenCalled();
});
