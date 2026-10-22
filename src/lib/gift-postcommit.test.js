import { afterEach, expect, it, vi } from "vitest";
vi.mock("./progression.js", () => ({ jsonSafe: value => value }));
vi.mock("./gift-refunds.js", () => ({ recordGiftRecovery: vi.fn() }));
import { runGiftOperation, isRetryableGiftConflict } from "./gift-operation.js";
import { captureGiftEvent } from "./gift-outbox-context.js";
afterEach(() => { delete globalThis.portalIo; });
function database(commit) {
  const db = { giftRequest: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "request" }), update: vi.fn() }, realtimeOutbox: { updateMany: vi.fn() } };
  db.$transaction = vi.fn(async fn => { const result = await fn(db); await commit(); return result; }); return db;
}
const work = async () => { captureGiftEvent({ id: "event", channel: "audio-room:r", event: "gift:received", payload: { success: true, data: {} } }); return { data: {} }; };
it("emits only after commit and never for a rolled-back transaction", async () => {
  let committed = false;
  const emit = vi.fn(() => expect(committed).toBe(true)); globalThis.portalIo = { to: () => ({ emit }) };
  const db = database(() => { committed = true; });
  await runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db); expect(emit).toHaveBeenCalledOnce();
  emit.mockClear(); const broken = database(() => { throw Error("rollback"); });
  await expect(runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, broken)).rejects.toThrow("rollback");
  expect(emit).not.toHaveBeenCalled();
});
it("does not resend a replay or capture events from a serialization retry", async () => {
  const emit = vi.fn(); globalThis.portalIo = { to: () => ({ emit }) };
  let attempts = 0; const db = database(() => { if (++attempts === 1) throw Object.assign(Error("retry"), { code: "P2034" }); });
  await runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db); expect(emit).toHaveBeenCalledOnce();
  db.giftRequest.findUnique.mockResolvedValue({ fingerprint: "fp", result: { data: {} } });
  await runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db); expect(emit).toHaveBeenCalledOnce();
});

const conflicts = [
  { code: "P2010", meta: { code: "40001" } },
  { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001", kind: "TransactionWriteConflict" } } } },
  { code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } } },
  { code: "P2010", meta: { code: "40P01" } },
];
it.each(conflicts)("retries aborted raw-query conflicts with one committed charge and event: %j", async conflict => {
  let balance = 100, attempts = 0, saved = null;
  const emit = vi.fn(); globalThis.portalIo = { to: () => ({ emit }) };
  const db = database(() => {});
  db.$transaction = vi.fn(async (fn, options) => {
    expect(options.isolationLevel).toBe("Serializable");
    const tx = { ...db, giftRequest: {
      findUnique: async () => saved,
      create: async () => ({ id: "request" }),
      update: async () => {},
    }, balance };
    const result = await fn(tx);
    if (++attempts === 1) throw conflict;
    balance = tx.balance;
    saved = { fingerprint: "fp", result };
    return result;
  });
  const charge = vi.fn(async tx => { tx.balance -= 10; await work(); return { data: { balance: tx.balance } }; });
  const operation = { key: "same-key", fingerprint: "fp" };
  const result = await runGiftOperation("sender", operation, charge, db);
  expect(balance).toBe(90);
  expect(charge).toHaveBeenCalledTimes(2);
  expect(emit).toHaveBeenCalledOnce();
  expect(await runGiftOperation("sender", operation, charge, db)).toEqual(result);
  expect(balance).toBe(90);
  expect(charge).toHaveBeenCalledTimes(2);
  expect(emit).toHaveBeenCalledOnce();
  await expect(runGiftOperation("sender", { ...operation, fingerprint: "different" }, charge, db)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("stops after four conflicts without emitting", async () => {
  const emit = vi.fn(); globalThis.portalIo = { to: () => ({ emit }) };
  const db = database(() => { throw conflicts[0]; });
  await expect(runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db)).rejects.toBe(conflicts[0]);
  expect(db.$transaction).toHaveBeenCalledTimes(4);
  expect(emit).not.toHaveBeenCalled();
});
it.each(["P2010", "INSUFFICIENT_COINS", "FORBIDDEN", "IDEMPOTENCY_CONFLICT"])("does not retry unrelated %s errors", async code => {
  const error = { code, meta: { code: "42601" } };
  expect(isRetryableGiftConflict(error)).toBe(false);
  const db = database(() => { throw error; });
  await expect(runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db)).rejects.toBe(error);
  expect(db.$transaction).toHaveBeenCalledOnce();
});
