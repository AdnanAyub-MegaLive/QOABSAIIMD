import { afterEach, expect, it, vi } from "vitest";
import { roomCardMinCoins, invalidateRoomCardEnvelopeSettings, parseRoomCardMinCoins } from "./room-card-envelope-settings.js";
afterEach(() => vi.useRealTimers());
it("validates nonnegative exact BigInt values", () => {
  expect(parseRoomCardMinCoins("0")).toBe(0n);
  expect(parseRoomCardMinCoins("9007199254740993")).toBe(9007199254740993n);
  for (const value of ["", "-1", "1.2", "1e3", "9223372036854775808", null]) expect(() => parseRoomCardMinCoins(value)).toThrow();
});
it("coalesces reads, expires after 30 seconds and invalidates on save", async () => {
  vi.useFakeTimers();
  const findUnique = vi.fn(async () => ({ roomCardMinCoins: 1000n }));
  const db = { redEnvelopeSettings: { findUnique } };
  expect(await Promise.all([roomCardMinCoins(db), roomCardMinCoins(db)])).toEqual([1000n, 1000n]);
  expect(findUnique).toHaveBeenCalledTimes(1);
  await roomCardMinCoins(db);
  expect(findUnique).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(30001);
  await roomCardMinCoins(db);
  expect(findUnique).toHaveBeenCalledTimes(2);
  invalidateRoomCardEnvelopeSettings(db);
  await roomCardMinCoins(db);
  expect(findUnique).toHaveBeenCalledTimes(3);
});
it("does not cache failures or confuse databases", async () => {
  const findUnique = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(null);
  const db = { redEnvelopeSettings: { findUnique } };
  await expect(roomCardMinCoins(db)).rejects.toThrow("offline");
  expect(await roomCardMinCoins(db)).toBe(0n);
  expect(await roomCardMinCoins({ redEnvelopeSettings: { findUnique: async () => ({ roomCardMinCoins: 42n }) } })).toBe(42n);
});
