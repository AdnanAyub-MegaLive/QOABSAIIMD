import { describe, expect, it, vi } from "vitest";
import { assertCanBecomeReseller, assertGiftableUser, assertNotReseller, assertRoleSet, isReseller } from "./reseller-exclusivity.js";

vi.mock("./prisma.js", () => ({ prisma: {} }));
const { assertGiftRecipient } = await import("./gift-currency-settlement.js");

const reseller = { id: "r", role: "LISTENER", appRoles: ["LISTENER", "RESELLER"], agencyId: null };
const host = { id: "h", role: "HOST", appRoles: ["HOST"], agencyId: "a1" };
const user = { id: "u", role: "LISTENER", appRoles: ["LISTENER"], agencyId: null };
const db = (owns = false) => ({ agency: { findFirst: async ({ where }) => owns && where.status === "ACTIVE" ? { id: "ag" } : null } });

describe("reseller exclusivity", () => {
  it("detects resellers by app role or legacy role", () => {
    expect(isReseller(reseller)).toBe(true);
    expect(isReseller({ role: "RESELLER", appRoles: [] })).toBe(true);
    expect(isReseller(user)).toBe(false);
  });

  it("stops resellers becoming hosts or agency owners", () => {
    expect(() => assertNotReseller(reseller)).toThrow("Resellers cannot become hosts");
    expect(() => assertNotReseller(user)).not.toThrow();
  });

  it("stops active hosts and agency owners becoming resellers", async () => {
    await expect(assertCanBecomeReseller(db(), host)).rejects.toMatchObject({ code: "HOST_CANNOT_BE_RESELLER" });
    await expect(assertCanBecomeReseller(db(true), user)).rejects.toMatchObject({ code: "HOST_CANNOT_BE_RESELLER" });
    await expect(assertCanBecomeReseller(db(), user)).resolves.toBeUndefined();
    expect(() => assertRoleSet(["HOST", "RESELLER"])).toThrow();
    expect(() => assertRoleSet(["RESELLER"])).not.toThrow();
  });

  it("blocks gifts to resellers but not to others", async () => {
    expect(() => assertGiftableUser(reseller)).toThrow("Resellers cannot receive gifts.");
    const tx = (row) => ({ user: { findFirst: async () => row } });
    await expect(assertGiftRecipient(tx(reseller), reseller)).rejects.toMatchObject({ code: "RESELLER_CANNOT_RECEIVE_GIFTS", status: 403 });
    await expect(assertGiftRecipient(tx(user), user)).resolves.toBeUndefined();
  });
});
