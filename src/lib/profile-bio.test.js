import { describe, expect, it } from "vitest";
import { BIO_MAXIMUM_CHARACTERS, normalizeProfileBio } from "./profile-bio";

describe("profile bio validation", () => {
  it("saves Unicode plain text without changing characters", () => {
    expect(normalizeProfileBio("  خوش آمدید 👋  ")).toEqual({ value: "خوش آمدید 👋" });
  });

  it("clears null and empty values", () => {
    expect(normalizeProfileBio(null)).toEqual({ value: null });
    expect(normalizeProfileBio("   ")).toEqual({ value: null });
  });

  it("enforces a 200 Unicode-character maximum", () => {
    expect(normalizeProfileBio("🙂".repeat(BIO_MAXIMUM_CHARACTERS))).toEqual({
      value: "🙂".repeat(BIO_MAXIMUM_CHARACTERS),
    });
    expect(normalizeProfileBio("🙂".repeat(BIO_MAXIMUM_CHARACTERS + 1))).toEqual({
      error: "Bio must not exceed 200 characters.",
    });
  });

  it("rejects non-text and control-character input", () => {
    expect(normalizeProfileBio({ text: "bio" })).toEqual({ error: "Bio must be plain text." });
    expect(normalizeProfileBio("invalid\u0000text")).toEqual({ error: "Bio must be plain text." });
  });
});
