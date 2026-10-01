import { describe, expect, it } from "vitest";
import { normalizeGiftInteractions, serializeGiftInteractions } from "./audio-room-gift-interactions.js";

describe("audio room gift interactions", () => {
  it("normalizes the room-wide contract", () => {
    expect(normalizeGiftInteractions({ active: true, items: [{ id: "GIFT-1", count: 3 }] })).toEqual({ active: true, items: [{ id: "GIFT-1", count: 3 }] });
  });
  it("returns a safe inactive reconnect snapshot", () => {
    expect(serializeGiftInteractions(null)).toEqual({ active: false, items: [] });
  });
  it("rejects oversized catalogues", () => {
    expect(() => normalizeGiftInteractions({ active: true, items: Array.from({ length: 51 }) })).toThrow("at most 50");
  });
});
