import { describe, expect, it, vi } from "vitest";
import mobileSession from "./mobile-session.cjs";

describe("mobile session tokens", () => {
  it("binds a newly issued token to a stable device identifier", () => {
    vi.stubEnv("AUTH_SECRET", "test-mobile-session-secret");
    const token = mobileSession.createMobileSessionToken(
      { publicId: "USR-123456", sessionVersion: 4 },
      { deviceId: "android-installation-abc" },
    );

    expect(mobileSession.verifyMobileSessionToken(token)).toMatchObject({
      userId: "USR-123456",
      sessionVersion: 4,
      deviceId: "android-installation-abc",
      issuedAt: expect.any(Number),
    });
  });

  it("returns expiry metadata that exactly matches the opaque token", () => {
    vi.stubEnv("AUTH_SECRET", "test-mobile-session-secret");
    vi.stubEnv("MOBILE_SESSION_TTL_SECONDS", "3600");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));

    const session = mobileSession.createMobileSession(
      { publicId: "USR-123456", sessionVersion: 4 },
      { deviceId: "android-installation-abc" },
    );

    expect(session).toEqual({
      sessionToken: expect.any(String),
      tokenType: "Bearer",
      expiresAt: "2026-08-31T13:00:00.000Z",
      sessionVersion: 4,
    });
    expect(mobileSession.verifyMobileSessionToken(session.sessionToken).exp).toBe(
      Math.floor(new Date(session.expiresAt).getTime() / 1000),
    );

    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
});
