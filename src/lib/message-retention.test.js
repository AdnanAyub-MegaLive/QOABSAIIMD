import { expect, it, vi } from "vitest";
import { pruneExpiredMessages } from "./message-retention.js";
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
