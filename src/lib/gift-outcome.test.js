import { expect, it, vi } from "vitest";
import { readGiftOutcome } from "./gift-outcome.js";
it("scopes recovery to the authenticated sender and preserves the committed result", async () => {
  const result = { transactionId: "gift-1", luckyRewardCoins: "7" };
  const findUnique = vi.fn().mockResolvedValue({ result, createdAt: new Date("2026-10-15T00:00:00Z") });
  const value = await readGiftOutcome({ giftRequest: { findUnique } }, "sender", "request-123");
  expect(value.status).toBe("COMMITTED"); expect(value.result).toBe(result);
  expect(findUnique.mock.calls[0][0].where).toEqual({ senderId_key: { senderId: "sender", key: "request-123" } });
});
it("does not call a missing operation failed or issue another send", async () => {
  expect(await readGiftOutcome({ giftRequest: { findUnique: async () => null } }, "sender", "request-123")).toMatchObject({ status: "UNKNOWN", result: null });
  await expect(readGiftOutcome({}, "sender", "bad")).rejects.toThrow("Idempotency-Key");
});
