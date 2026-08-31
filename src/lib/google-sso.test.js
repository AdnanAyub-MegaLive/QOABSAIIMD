import { describe, expect, it } from "vitest";
import { googleProfileFromPayload, normalizeGooglePhone } from "./google-sso";

describe("Google SSO profile validation", () => {
  it("uses the immutable Google subject and a verified Gmail address", () => {
    expect(googleProfileFromPayload({
      sub: "google-subject-123",
      email: "Aisha@gmail.com",
      email_verified: true,
      name: "Aisha Khan",
      picture: "https://lh3.googleusercontent.com/a/photo.jpg",
    })).toMatchObject({
      subject: "google-subject-123",
      email: "aisha@gmail.com",
      name: "Aisha Khan",
      emailAuthoritative: true,
    });
  });

  it("rejects tokens without an immutable Google subject or verified email", () => {
    expect(() => googleProfileFromPayload({ email: "aisha@gmail.com", email_verified: true }))
      .toThrow(/invalid/i);
    try {
      googleProfileFromPayload({ sub: "google-subject-123", email: "aisha@gmail.com" });
    } catch (error) {
      expect(error.code).toBe("GOOGLE_EMAIL_UNVERIFIED");
    }
  });

  it("does not treat a verified third-party email as authoritative", () => {
    expect(googleProfileFromPayload({
      sub: "google-subject-123",
      email: "aisha@example.com",
      email_verified: true,
    }).emailAuthoritative).toBe(false);
  });

  it("allows first-time Google accounts to omit a phone but rejects malformed values", () => {
    expect(normalizeGooglePhone(undefined)).toBeNull();
    expect(normalizeGooglePhone("+92 300 1234567")).toBe("+923001234567");
    expect(() => normalizeGooglePhone("not-a-phone")).toThrow(
      "Enter a valid phone number containing 7 to 15 digits.",
    );
  });
});
