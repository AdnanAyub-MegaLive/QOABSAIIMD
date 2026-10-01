import { describe, expect, it } from "vitest";
import { luckyShare, parseRedEnvelopeInput } from "./red-envelope-contract";

describe("red envelope contract", () => {
  it("validates and normalizes create input", () => {
    expect(parseRedEnvelopeInput({ roomId: " ROOM-1 ", totalCoins: "500", shareCount: 5, delaySeconds: 10 })).toEqual({
      roomId: "ROOM-1",
      totalCoins: 500n,
      shareCount: 5,
      delaySeconds: 10,
    });
  });

  it("requires at least one coin for every share", () => {
    expect(() => parseRedEnvelopeInput({ roomId: "ROOM-1", totalCoins: "2", shareCount: 3, delaySeconds: 0 })).toThrow("at least one coin");
  });

  it("keeps enough coins for remaining claimants", () => {
    expect(luckyShare(10n, 4, () => 6)).toBe(6n);
    expect(luckyShare(4n, 4, () => 1)).toBe(1n);
    expect(luckyShare(7n, 1, () => 1)).toBe(7n);
  });
});
