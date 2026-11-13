import { expect, it, vi } from "vitest";
import { applyAdminDiamondDeduction } from "./admin-diamond-deduction.js";

function fixture() {
  let receipt;
  const db = {
    user: { findUniqueOrThrow: vi.fn(async () => ({ id: "user", hostSalaryCoinBalance: 100n })), update: vi.fn() },
    walletTransaction: { create: vi.fn() }, auditLog: { create: vi.fn() },
    adminCoinAdjustmentRequest: { findUnique: vi.fn(async () => receipt), create: vi.fn(async ({ data }) => { receipt = data; }) },
  };
  db.$transaction = vi.fn(fn => fn(db));
  return db;
}
const input = { publicId: "USR1", amount: "40", reason: "Correction", requestId: "request-123" };
const admin = { id: "admin" };
it("deducts only personal diamonds and records an exact ledger debit and audit", async () => {
  const db = fixture();
  expect((await applyAdminDiamondDeduction(db, admin, input)).balance).toBe("60");
  expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user" }, data: { hostSalaryCoinBalance: { decrement: 40n } } });
  expect(db.walletTransaction.create.mock.calls[0][0].data).toMatchObject({ diamonds: 40n, coins: null, direction: "DEBIT", type: "ADMIN_ADJUSTMENT" });
  expect(db.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({ balanceBefore: "100", balanceAfter: "60" });
  await applyAdminDiamondDeduction(db, admin, input);
  expect(db.user.update).toHaveBeenCalledTimes(1);
  await expect(applyAdminDiamondDeduction(db, admin, { ...input, amount: "41" })).rejects.toThrow("CONFLICT");
});
it("rejects overdrafts and deleted accounts without writing", async () => {
  const db = fixture();
  await expect(applyAdminDiamondDeduction(db, admin, { ...input, amount: "101" })).rejects.toThrow("INSUFFICIENT_DIAMONDS");
  db.user.findUniqueOrThrow.mockResolvedValue({ deletedAt: new Date() });
  await expect(applyAdminDiamondDeduction(db, admin, input)).rejects.toThrow("USER_NOT_FOUND");
  expect(db.user.update).not.toHaveBeenCalled();
});
it.each(["0", "-1", "1.5", "9223372036854775808"])("rejects invalid amount %s", async amount => {
  await expect(applyAdminDiamondDeduction(fixture(), admin, { ...input, amount })).rejects.toThrow("INVALID_DIAMOND_AMOUNT");
});
it("requires reasons and request IDs and retries transaction conflicts", async () => {
  const db = fixture();
  await expect(applyAdminDiamondDeduction(db, admin, { ...input, reason: " " })).rejects.toThrow("REASON_REQUIRED");
  await expect(applyAdminDiamondDeduction(db, admin, { ...input, requestId: null })).rejects.toThrow("REQUEST_ID_REQUIRED");
  db.$transaction.mockRejectedValueOnce({ code: "P2034" });
  expect((await applyAdminDiamondDeduction(db, admin, input)).balance).toBe("60");
});
