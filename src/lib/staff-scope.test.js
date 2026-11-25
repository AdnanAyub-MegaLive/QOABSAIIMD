import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
const { capGrant, countryLabel, normalizeCountries, requireUserInScope, scopedUserWhere, userInScope } = await import("./staff-scope.js");
const rm = { role: "STAFF", allowedCountries: ["Pakistan", "Saudi Arabia"], maxGrantDays: 7 };

describe("staff region scope", () => {
  it("matches stored names and ISO codes", () => {
    expect(userInScope(rm, "PK")).toBe(true);
    expect(userInScope(rm, "Saudi Arabia")).toBe(true);
    expect(userInScope(rm, "SA")).toBe(true);
    expect(userInScope(rm, "India")).toBe(false);
    expect(userInScope(rm, null)).toBe(false);
    expect(countryLabel("pk")).toBe("Pakistan");
  });
  it("is unrestricted for super admins and staff without countries", () => {
    expect(scopedUserWhere({ role: "SUPER_ADMIN", allowedCountries: ["Pakistan"] })).toEqual({});
    expect(userInScope({ role: "STAFF", allowedCountries: [] }, "India")).toBe(true);
  });
  it("refuses users outside the region", async () => {
    const db = { user: { findUnique: async ({ where }) => ({ country: where.publicId === "USR-1" ? "PK" : "India" }) } };
    await expect(requireUserInScope(rm, "USR-1", db)).resolves.toBeUndefined();
    await expect(requireUserInScope(rm, "USR-2", db)).rejects.toMatchObject({ status: 403, code: "OUT_OF_REGION" });
  });
  it("caps timed grants and blocks permanent ones", () => {
    expect(capGrant(rm, { durationMinutes: 7 * 1440 })).toBe(7 * 1440);
    expect(() => capGrant(rm, { durationMinutes: 7 * 1440 + 1 })).toThrow("7 days");
    expect(() => capGrant(rm, { permanent: true })).toThrow("7 days");
    expect(capGrant({ role: "SUPER_ADMIN", maxGrantDays: 7 }, { permanent: true })).toBeUndefined();
  });
  it("accepts only listed countries", () => {
    expect(normalizeCountries(["India", "Pakistan", "India"])).toEqual(["India", "Pakistan"]);
    expect(() => normalizeCountries(["Atlantis"])).toThrow();
  });
});
