import { describe, expect, it } from "vitest";
import { bannedAccountLoginResponse } from "./mobile-login-response";

describe("banned account login response", () => {
  it("uses the mobile API error envelope without a session token", () => {
    const body = bannedAccountLoginResponse({
      reason: "Repeated policy violations",
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(body).toEqual({
      success: false,
      error: {
        code: "ACCOUNT_BANNED",
        message: "This account has been banned.",
        details: {
          reason: "Repeated policy violations",
          expiresAt: "2026-09-01T00:00:00.000Z",
        },
      },
    });
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toContain("sessionToken");
  });
});
