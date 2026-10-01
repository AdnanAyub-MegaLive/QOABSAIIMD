import { describe, expect, it } from "vitest";
import { normalizeLegacyId } from "./legacy-id-mapping";

describe("legacy ID mapping", () => {
  it("preserves a numeric legacy identifier as a string", () => {
    expect(normalizeLegacyId(" 001234 ")).toBe("001234");
  });

  it("rejects non-numeric and unsafe identifiers", () => {
    expect(() => normalizeLegacyId("USR-123456")).toThrow("INVALID_LEGACY_ID");
    expect(() => normalizeLegacyId("123.4")).toThrow("INVALID_LEGACY_ID");
    expect(() => normalizeLegacyId("")).toThrow("INVALID_LEGACY_ID");
  });
});
