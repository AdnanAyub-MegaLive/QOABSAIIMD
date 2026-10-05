import { describe, expect, it, vi } from "vitest";
import { chooseSignupCountry, clientSignupCountry, normalizeCountryCode, normalizeSignupCountry, requiresSignupGeolocation, resolveSignupCountry } from "./geo-country";

describe("signup geolocation", () => {
  it("normalizes only ISO alpha-2 country codes", () => {
    expect(normalizeCountryCode(" pk ")).toBe("PK");
    expect(normalizeCountryCode("XX")).toBeNull();
    expect(normalizeCountryCode("Pakistan")).toBeNull();
    expect(normalizeCountryCode("ZZ")).toBeNull();
  });

  it.each([["Pakistan", "PK"], ["pk", "PK"], ["United States", "US"], ["USA", "US"], ["Côte d’Ivoire", "CI"], ["South Korea", "KR"]])("normalizes selected country %s", (value, code) => {
    expect(normalizeSignupCountry(value)).toBe(code);
  });

  it("distinguishes omitted and explicitly invalid selected countries", () => {
    expect(clientSignupCountry(undefined)).toEqual({ provided: false, country: null });
    expect(clientSignupCountry(" ")).toEqual({ provided: false, country: null });
    expect(clientSignupCountry("Not a country")).toEqual({ provided: true, country: null });
  });

  it("uses client selection first, connection only as fallback, and permits neither", () => {
    vi.stubEnv("NODE_ENV", "development");
    const withGeo = new Request("https://portal.example/api/register", { headers: { "cf-ipcountry": "US" } });
    const withoutGeo = new Request("https://portal.example/api/register");
    expect(chooseSignupCountry(withGeo, "Pakistan")).toMatchObject({ country: "PK", source: "client" });
    expect(chooseSignupCountry(withGeo, undefined)).toMatchObject({ country: "US", source: "cf-ipcountry" });
    expect(chooseSignupCountry(withoutGeo, undefined)).toMatchObject({ country: null, source: null });
    expect(chooseSignupCountry(withGeo, "not-a-country")).toMatchObject({ provided: true, country: null, source: null });
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

  it("does not require connection geolocation for signup", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GEOLOCATION_REQUIRED", "false");
    expect(requiresSignupGeolocation()).toBe(false);
    expect(normalizeCountryCode("unknown")).toBeNull();
  });
});
