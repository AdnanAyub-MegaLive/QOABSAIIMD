import { describe, expect, it, vi } from "vitest";
import mobileSession from "./mobile-session.cjs";
import { sessionInvalidation } from "./mobile-session-state.js";
import { createHmac } from "node:crypto";

it("preserves milliseconds so a fresh login after forced logout is accepted", () => {
  vi.stubEnv("AUTH_SECRET", "test-mobile-session-secret");
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-26T12:00:00.800Z"));
    const user = { publicId: "USR-1", sessionVersion: 3, status: "ACTIVE", forcedLogoutAt: new Date("2026-10-26T12:00:00.500Z") };
    const session = mobileSession.createMobileSession(user);
    const payload = mobileSession.verifyMobileSessionToken(session.sessionToken);
    expect(payload.issuedAt).toBe(Date.now());
    expect(sessionInvalidation(user, payload)).toBeNull();
    expect(sessionInvalidation(user, { ...payload, issuedAt: user.forcedLogoutAt.getTime() })).toBe("SESSION_REVOKED");
    expect(new Date(session.expiresAt).getTime()).toBe(payload.exp * 1000);
  } finally { vi.useRealTimers(); vi.unstubAllEnvs(); }
});

it("normalizes malformed signed payloads and rejects trailing token segments", () => {
  vi.stubEnv("AUTH_SECRET", "test-mobile-session-secret");
  try {
    for (const text of ["not-json", "null", JSON.stringify({ userId: "USR-1", sessionVersion: 1 })]) {
      const body = Buffer.from(text).toString("base64url");
      const sig = createHmac("sha256", process.env.AUTH_SECRET).update(body).digest("base64url");
      expect(() => mobileSession.verifyMobileSessionToken(`${body}.${sig}`)).toThrow("INVALID_SESSION_TOKEN");
    }
    const token = mobileSession.createMobileSessionToken({ publicId: "USR-1", sessionVersion: 1 });
    expect(() => mobileSession.verifyMobileSessionToken(`${token}.extra`)).toThrow("INVALID_SESSION_TOKEN");
  } finally { vi.unstubAllEnvs(); }
});

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
