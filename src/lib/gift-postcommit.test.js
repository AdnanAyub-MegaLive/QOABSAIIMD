import { afterEach, expect, it, vi } from "vitest";
vi.mock("./progression.js", () => ({ jsonSafe: value => value }));
vi.mock("./gift-refunds.js", () => ({ recordGiftRecovery: vi.fn() }));
import { runGiftOperation } from "./gift-operation.js";
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
