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
    });
  });
});
