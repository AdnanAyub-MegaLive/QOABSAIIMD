import { expect, it, vi } from "vitest";
import { purchaseSpecialId } from "./special-id-commerce.js";
function database() {
  const db = {
    $queryRaw: vi.fn(async () => []),
    user: { findUnique: vi.fn(async () => ({ id: "u", publicId: "USR-2030140", status: "ACTIVE", coinBalance: 100n })), updateMany: vi.fn(async () => ({ count: 1 })) },
    specialIdDefinition: { findUnique: vi.fn(async () => ({ id: "d", code: "2030222", active: true, storeVisible: true, coinPrice: 20n, defaultDurationMinutes: 60 })) },
    specialIdAssignment: { findFirst: vi.fn(async () => null), updateMany: vi.fn(), create: vi.fn(async () => ({ id: "a" })) },
    specialIdPurchase: { findUnique: vi.fn(async () => null), create: vi.fn() },
    walletTransaction: { create: vi.fn() }, auditLog: { create: vi.fn() },
  };
  db.$transaction = vi.fn(async fn => fn(db)); return db;
}
it("debits Coins and records a durable replay result in one serializable transaction", async () => {
  const db = database(); const result = await purchaseSpecialId(db, "u", "d", "request-123");
  expect(result).toMatchObject({ specialId: "2030222", normalId: "USR-2030140", coinBalance: "80", price: "20" });
  expect(db.walletTransaction.create.mock.calls[0][0].data).toMatchObject({ type: "SPECIAL_ID_PURCHASE", coins: 20n });
  expect(db.specialIdPurchase.create.mock.calls[0][0].data.result).toEqual(result);
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  expect(db.$queryRaw.mock.calls[0][0][0]).toContain("pg_advisory_xact_lock(2030140)::text");
});
it("retries the pg adapter serialization conflict and preserves the request key", async () => {
  const db=database();
  db.$queryRaw.mockRejectedValueOnce({code:"P2010",meta:{driverAdapterError:{cause:{kind:"TransactionWriteConflict",originalCode:"40001"}}}});
  const result=await purchaseSpecialId(db,"u","d","request-123");
  expect(result.coinBalance).toBe("80");
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(db.user.updateMany).toHaveBeenCalledOnce();
  expect(db.specialIdPurchase.create.mock.calls[0][0].data.requestKey).toBe("request-123");
});
it("returns a specific conflict after bounded retries", async () => {
  const db=database();db.$queryRaw.mockRejectedValue({code:"P2010",meta:{code:"40001"}});
  await expect(purchaseSpecialId(db,"u","d","request-123")).rejects.toMatchObject({code:"SPECIAL_ID_PURCHASE_BUSY",status:409});
  expect(db.$transaction).toHaveBeenCalledTimes(4);expect(db.user.updateMany).not.toHaveBeenCalled();
});
it("does not retry unrelated raw SQL errors", async () => {
  const db=database(),error={code:"P2010",meta:{code:"42601"}};db.$queryRaw.mockRejectedValue(error);
  await expect(purchaseSpecialId(db,"u","d","request-123")).rejects.toBe(error);
  expect(db.$transaction).toHaveBeenCalledOnce();
});
it("returns original replay without another debit", async () => {
  const db = database(), result = { coinBalance: "80" };
  db.specialIdPurchase.findUnique.mockResolvedValue({ definitionId: "d", result });
  expect(await purchaseSpecialId(db, "u", "d", "request-123")).toEqual(result);
  expect(db.user.updateMany).not.toHaveBeenCalled();
});
it("rejects reuse of a key for another ID", async () => {
  const db = database(); db.specialIdPurchase.findUnique.mockResolvedValue({ definitionId: "other" });
  await expect(purchaseSpecialId(db, "u", "d", "request-123")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("rejects unavailable and occupied IDs before charging", async () => {
  const db = database(); db.specialIdDefinition.findUnique.mockResolvedValue({ active: true, storeVisible: false });
  await expect(purchaseSpecialId(db, "u", "d", "request-123")).rejects.toMatchObject({ code: "SPECIAL_ID_NOT_FOR_SALE" });
  expect(db.user.updateMany).not.toHaveBeenCalled();
  const occupied = database(); occupied.specialIdAssignment.findFirst.mockResolvedValue({ id: "occupied" });
  await expect(purchaseSpecialId(occupied, "u", "d", "request-123")).rejects.toMatchObject({ code: "SPECIAL_ID_ALREADY_ASSIGNED" });
  expect(occupied.user.updateMany).not.toHaveBeenCalled();
});
it("does not grant an ID with insufficient Coins", async () => {
  const db = database(); db.user.updateMany.mockResolvedValue({ count: 0 });
  await expect(purchaseSpecialId(db, "u", "d", "request-123")).rejects.toMatchObject({ code: "INSUFFICIENT_COINS" });
  expect(db.specialIdAssignment.create).not.toHaveBeenCalled();
});
