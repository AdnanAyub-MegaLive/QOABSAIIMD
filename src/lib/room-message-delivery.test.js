import { expect, it, vi } from "vitest";
import { persistRoomMessage, plainRoomMessage } from "./room-message-delivery.js";
it("persists message and retryable event in one transaction", async () => {
  const message = { publicId: "m", roomPublicId: "r", senderPublicId: "u", senderName: "User", body: "hello", createdAt: new Date(), requestId: "request" };
  const tx = { audioRoomMessage: { create: vi.fn(async () => message) }, realtimeOutbox: { create: vi.fn() } };
  const db = { $transaction: vi.fn(fn => fn(tx)) };
  expect(await persistRoomMessage(db, { data: {} })).toBe(message);
  expect(tx.realtimeOutbox.create).toHaveBeenCalledWith({ data: { channel: "audio-room:r", event: "audio-room:message", payload: { success: true, data: plainRoomMessage(message) } } });
});
it("propagates outbox failure so the transaction rolls back", async () => {
  const tx = { audioRoomMessage: { create: async () => ({ createdAt: new Date() }) }, realtimeOutbox: { create: async () => { throw new Error("outbox failed"); } } };
  await expect(persistRoomMessage({ $transaction: fn => fn(tx) }, {})).rejects.toThrow("outbox failed");
});
it("keeps a durable message when artwork lookup fails", async () => {
  const message = { publicId: "m", roomPublicId: "r", senderPublicId: "u", senderName: "User", body: "hello", createdAt: new Date() };
  const tx = { audioRoomMessage: { create: vi.fn(async () => message) }, realtimeOutbox: { create: vi.fn() } };
  await persistRoomMessage({ $transaction: fn => fn(tx) }, {}, "https://portal.test", async () => { throw new Error("artwork unavailable"); });
  expect(tx.realtimeOutbox.create.mock.calls[0][0].data.payload.data.body).toBe("hello");
});
it("bounds artwork waiting and still records delivery", async () => {
  vi.useFakeTimers();
  try {
    const message = { publicId: "m", roomPublicId: "r", senderPublicId: "u", senderName: "User", body: "hello", createdAt: new Date() };
    const tx = { audioRoomMessage: { create: vi.fn(async () => message) }, realtimeOutbox: { create: vi.fn() } };
    const result = persistRoomMessage({ $transaction: fn => fn(tx) }, {}, "https://portal.test", () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(150);
    await result;
    expect(tx.realtimeOutbox.create).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
