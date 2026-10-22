import { expect, it, vi } from "vitest";
import { applyAdminCoinAdjustment } from "./admin-coin-adjustment.js";

function fixture() {
  const saved = new Map();
  const db = {
    user: { findUniqueOrThrow: vi.fn(async () => ({ id: "u", coinBalance: 100n })), update: vi.fn() },
    coinAdjustment: { create: vi.fn() }, walletTransaction: { create: vi.fn() }, auditLog: { create: vi.fn() },
    adminCoinAdjustmentRequest: { findUnique: vi.fn(async ({where}) => saved.get(JSON.stringify(where))), create: vi.fn(async ({data}) => saved.set(JSON.stringify({adminId_requestId:{adminId:data.adminId,requestId:data.requestId}}),data)) },
  };
  db.$transaction = vi.fn(fn => fn(db));
  return db;
}
const input = { publicId: "USR-1", operation: "add", amount: "50", reason: "Approved reward", requestId: "request-123" };
const admin = { id: "admin" };
it("returns the identical original result on replay with no second writes", async () => {
  const db = fixture();
  const first = await applyAdminCoinAdjustment(db, admin, input);
  expect(await applyAdminCoinAdjustment(db, admin, input)).toEqual(first);
  expect(db.user.update).toHaveBeenCalledTimes(1);
  expect(db.walletTransaction.create).toHaveBeenCalledTimes(1);
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  await expect(applyAdminCoinAdjustment(db, admin, {...input, amount:"51"})).rejects.toThrow("ADJUSTMENT_REQUEST_CONFLICT");
});
it("rejects excessive removal before writing anything", async () => {
  const db = fixture();
  await expect(applyAdminCoinAdjustment(db, admin, {...input, operation:"remove",amount:"101"})).rejects.toThrow("INSUFFICIENT_COINS");
  expect(db.user.update).not.toHaveBeenCalled();
});
it("requires idempotency keys and audit reasons", async () => {
  const db = fixture();
  await expect(applyAdminCoinAdjustment(db, admin, {...input,requestId:null})).rejects.toThrow("REQUEST_ID_REQUIRED");
  await expect(applyAdminCoinAdjustment(db, admin, {...input,reason:" "})).rejects.toThrow("REASON_REQUIRED");
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("retries serialization conflicts within a bounded retry loop", async () => {
  const db = fixture(); db.$transaction.mockRejectedValueOnce({code:"P2034"});
  expect((await applyAdminCoinAdjustment(db, admin,input)).balance).toBe("150");
  expect(db.$transaction).toHaveBeenCalledTimes(2);
});
it("keeps amounts exact beyond JavaScript integer precision", async () => {
  const db = fixture();
  expect((await applyAdminCoinAdjustment(db,admin,{...input,amount:"9007199254740993"})).balance).toBe("9007199254741093");
});
