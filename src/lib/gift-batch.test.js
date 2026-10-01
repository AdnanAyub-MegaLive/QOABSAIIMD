import { describe, expect, it } from "vitest";
import { parseGiftBatchId } from "./gift-batch";

describe("gift batch correlation", () => {
  it("supports old clients and explicit null", () => {
    expect(parseGiftBatchId()).toBeNull();
    expect(parseGiftBatchId(null)).toBeNull();
  });
  it("preserves exact IDs including the 64-character boundary", () => {
    for (const value of ["send-action-123", " exact ", "x".repeat(64), "🎁".repeat(64)]) {
      expect(parseGiftBatchId(value)).toBe(value);
    }
  });
  it.each(["", "   ", "x".repeat(65), 123, true, {}, []])("rejects malformed IDs: %j", value => {
    expect(() => parseGiftBatchId(value)).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });
  it("does not suppress repeated IDs", () => {
    expect([1, 2, 3].map(() => parseGiftBatchId("same-action"))).toEqual(["same-action", "same-action", "same-action"]);
  });
});
