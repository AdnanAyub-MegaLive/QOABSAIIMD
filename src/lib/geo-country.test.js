import { describe, expect, it, vi } from "vitest";
import { normalizeCountryCode, resolveSignupCountry } from "./geo-country";

describe("signup geolocation", () => {
  it("normalizes only ISO alpha-2 country codes", () => {
    expect(normalizeCountryCode(" pk ")).toBe("PK");
    expect(normalizeCountryCode("XX")).toBeNull();
    expect(normalizeCountryCode("Pakistan")).toBeNull();
  });

  it("uses the trusted edge country header during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request("https://portal.example.com/api/v1/auth/register", {
      headers: { "cf-ipcountry": "PK" },
    });
    expect(resolveSignupCountry(request)).toEqual({ country: "PK", source: "cf-ipcountry" });
  });

  it("does not trust client-supplied geo headers in production without proxy configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUST_PROXY_GEO_HEADERS", "false");
    const request = new Request("https://portal.example.com/api/v1/auth/register", {
      headers: { "cf-ipcountry": "PK" },
    });
    expect(resolveSignupCountry(request)).toEqual({ country: null, source: null });
  });
});
