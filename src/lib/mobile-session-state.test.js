import { describe, expect, it } from "vitest";
import { mobileSessionError, sessionInvalidation, signedAssetSessionInvalidation } from "./mobile-session-state";

const validUser = {
  deletedAt: null,
  status: "ACTIVE",
  sessionVersion: 3,
  forcedLogoutAt: null,
};
const validPayload = { sessionVersion: 3, issuedAt: 1_800_000_000_000 };

describe("mobile session invalidation", () => {
  it("accepts verified current-version asset signatures after re-login, without weakening Bearer checks", () => {
    const user = { ...validUser, forcedLogoutAt: new Date() };
    const signature = { sessionVersion: 3 };
    expect(signedAssetSessionInvalidation(user, signature)).toBeNull();
    expect(sessionInvalidation(user, signature)).toBe("SESSION_REVOKED");
    expect(signedAssetSessionInvalidation({ ...user, sessionVersion: 4 }, signature)).toBe("SESSION_REVOKED");
    expect(signedAssetSessionInvalidation({ ...user, status: "BANNED" }, signature)).toBe("SESSION_REVOKED");
    expect(signedAssetSessionInvalidation({ ...user, deletedAt: new Date() }, signature)).toBe("SESSION_REVOKED");
    expect(signedAssetSessionInvalidation(null, signature)).toBe("INVALID_SESSION");
  });
  it("uses INVALID_SESSION when the token identity no longer resolves", () => {
    expect(sessionInvalidation(null, validPayload)).toBe("INVALID_SESSION");
  });

  it.each([
    [{ ...validUser, sessionVersion: 4 }, "session-version mismatch"],
    [{ ...validUser, deletedAt: new Date() }, "deleted account"],
    [{ ...validUser, status: "SUSPENDED" }, "inactive account"],
    [{ ...validUser, forcedLogoutAt: new Date(1_800_000_000_001) }, "forced logout"],
  ])("uses SESSION_REVOKED for %s", (user) => {
    expect(sessionInvalidation(user, validPayload)).toBe("SESSION_REVOKED");
  });

  it("uses the v1-compatible 401 error body", () => {
    expect(mobileSessionError("SESSION_REVOKED")).toEqual({
      success: false,
      error: {
        code: "SESSION_REVOKED",
        message: "This mobile session has been revoked. Please sign in again.",
      },
    });
  });
});
