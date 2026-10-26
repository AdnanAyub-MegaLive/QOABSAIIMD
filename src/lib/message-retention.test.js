import { expect, it, vi } from "vitest";
import { pruneExpiredMessages, startMessageRetention } from "./message-retention.js";
it("defers startup and contention without running a tight retry loop", async () => {
  vi.useFakeTimers();
  const db = { $transaction: vi.fn().mockRejectedValue(Object.assign(new Error("busy"), { code: "P2028" })) };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const stop = startMessageRetention(db, logger);
  try {
    expect(db.$transaction).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60000);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10000);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 1000, timeout: 5000 });
  } finally { stop(); vi.useRealTimers(); }
});
it("uses a fixed 30-day cutoff and never touches notifications", async () => {
  const tx = { $queryRaw: vi.fn(async () => []), $executeRaw: vi.fn(async () => 0) };
  const db = { $transaction: fn => fn(tx) };
  const result = await pruneExpiredMessages(db, new Date("2026-10-07T12:00:00Z"));
  expect(result).toEqual({ messages: 0, roomMessages: 0, cutoff: "2026-09-07T12:00:00.000Z" });
  expect(tx.$queryRaw.mock.calls[0][1]).toEqual(new Date(result.cutoff));
  expect(tx.$executeRaw.mock.calls[0][0].join("")).not.toContain("Notification");
});
it("bounds batches and updates affected conversation summaries", async () => {
  const tx = { $queryRaw: vi.fn(async () => [{ conversationId: "c1" }]), $executeRaw: vi.fn(async () => 1) };
  const result = await pruneExpiredMessages({ $transaction: fn => fn(tx) }, new Date(), { batchSize: 1, maxBatches: 2 });
  expect(result.messages).toBe(2);
  expect(result.roomMessages).toBe(2);
  expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
});
