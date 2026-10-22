import { beforeEach, expect, it, vi } from "vitest";
const media = vi.hoisted(() => ({ version: vi.fn(async p => p), refresh: vi.fn(async p => p) }));
vi.mock("./media-payload.js", () => ({ versionMediaPayload: media.version }));
vi.mock("./activity-event-media.js", () => ({ refreshActivityEventMedia: media.refresh }));
import { deliverCommittedGiftEvents, flushRealtimeOutbox } from "./realtime-outbox.js";
const row = id => ({ id, channel: "audio-room:room", event: "gift:received", payload: { success: true, data: { transactionId: id, mediaVersion: "abc" } } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => vi.clearAllMocks());
it("emits a 20-tap batch before one delivery write, without gift media queries", async () => {
  const emit = vi.fn(), io = { to: vi.fn(() => ({ emit })) };
  const db = { realtimeOutbox: { updateMany: vi.fn(async () => { expect(emit).toHaveBeenCalledTimes(20); }) } };
  await deliverCommittedGiftEvents(Array.from({ length: 20 }, (_, i) => row(String(i))), io, db);
  expect(db.realtimeOutbox.updateMany).toHaveBeenCalledTimes(1);
  expect(media.version).not.toHaveBeenCalled();
  expect(emit.mock.calls[0]).toEqual(["gift:received", { success: true, data: { transactionId: "0", mediaVersion: "abc", eventId: "0" } }]);
  expect(io.to).toHaveBeenCalledWith("audio-room:room");
});
it("runs another pass when a flush arrives while a pass is running", async () => {
  const gate = deferred(), emit = vi.fn(), io = { to: () => ({ emit }) };
  const db = { realtimeOutbox: { findMany: vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValueOnce([row("new")]), updateMany: vi.fn() } };
  const first = flushRealtimeOutbox(io, db), second = flushRealtimeOutbox(io, db);
  gate.resolve([]); await Promise.all([first, second]);
  expect(db.realtimeOutbox.findMany).toHaveBeenCalledTimes(2); expect(emit).toHaveBeenCalledTimes(1);
});
it("leaves failed emissions pending and retries with the same event ID", async () => {
  const emit = vi.fn().mockImplementationOnce(() => { throw Error("offline"); });
  const db = { realtimeOutbox: { findMany: vi.fn().mockResolvedValue([row("stable")]), updateMany: vi.fn() } }, io = { to: () => ({ emit }) };
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await flushRealtimeOutbox(io, db);
  expect(db.realtimeOutbox.updateMany.mock.calls[0][0].data).not.toHaveProperty("deliveredAt");
  await flushRealtimeOutbox(io, db);
  expect(emit.mock.calls.map(c => c[1].data.eventId)).toEqual(["stable", "stable"]);
  log.mockRestore();
});
it("does not emit the same in-flight row concurrently", async () => {
  const gate = deferred(), emit = vi.fn(), io = { to: () => ({ emit }) };
  const db = { realtimeOutbox: { findMany: vi.fn().mockResolvedValue([row("one")]), updateMany: vi.fn(() => gate.promise) } };
  const fast = deliverCommittedGiftEvents([row("one")], io, db);
  await flushRealtimeOutbox(io, db); expect(emit).toHaveBeenCalledTimes(1);
  gate.resolve(); await fast;
});
it("retains enrichment for non-gift events and tolerates unavailable Socket.IO", async () => {
  const db = { realtimeOutbox: { findMany: vi.fn().mockResolvedValue([{ ...row("level"), event: "activity-progression:updated" }]), updateMany: vi.fn() } };
  await flushRealtimeOutbox(null, db); expect(db.realtimeOutbox.findMany).not.toHaveBeenCalled();
  await flushRealtimeOutbox({ to: () => ({ emit: vi.fn() }) }, db);
  expect(media.refresh).toHaveBeenCalledOnce(); expect(media.version).toHaveBeenCalledOnce();
});
it("drains more than 100 pending events without waiting for the timer", async () => {
  const emit = vi.fn();
  const db = { realtimeOutbox: { findMany: vi.fn().mockResolvedValueOnce(Array.from({length:100},(_,i)=>row(String(i)))).mockResolvedValueOnce([row("last")]), updateMany: vi.fn() } };
  await flushRealtimeOutbox({to:()=>({emit})},db);
  expect(emit).toHaveBeenCalledTimes(101);expect(db.realtimeOutbox.updateMany).toHaveBeenCalledTimes(2);
});
it("can retry after the delivery marker write fails", async () => {
  const emit=vi.fn(),db={realtimeOutbox:{findMany:vi.fn().mockResolvedValue([row("same")]),updateMany:vi.fn().mockRejectedValueOnce(Error("database offline")).mockResolvedValueOnce({count:1})}};
  await expect(flushRealtimeOutbox({to:()=>({emit})},db)).rejects.toThrow("database offline");
  await flushRealtimeOutbox({to:()=>({emit})},db);
  expect(emit.mock.calls.map(call=>call[1].data.eventId)).toEqual(["same","same"]);
});
