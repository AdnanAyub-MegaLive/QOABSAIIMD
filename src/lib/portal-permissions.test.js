import { describe, it, expect } from "vitest";
import { allPermissions, hasPermission, validatePermissions, permissionForPage, canAccessPage } from "./portal-permissions.js";
import { effectiveAdmin, canManageStaff, staffDto } from "./portal-staff-state.js";

const root = { id: "root", active: true, role: "SUPER_ADMIN", permissions: [] };
const manager = { id: "manager", active: true, role: "MANAGER", createdById: "root", permissions: ["rooms.view", "rooms.manage", "accounts.view", "accounts.create"] };
const staff = { id: "staff", active: true, role: "STAFF", createdById: "manager", permissions: ["rooms.view", "rooms.manage"] };
const db = rows => ({ admin: { findUnique: async ({ where }) => rows.find(row => row.id === where.id) ?? null } });

describe("portal permission boundaries", () => {
  it("defaults to no access and gives only active platform managers full access", () => {
    expect(new Set(allPermissions).size).toBe(allPermissions.length);
    expect(hasPermission(null, "finance.adjust")).toBe(false);
    expect(hasPermission({ ...root, active: false }, "finance.adjust")).toBe(false);
    expect(hasPermission(root, "finance.adjust")).toBe(true);
    expect(hasPermission(staff, "finance.adjust")).toBe(false);
  });
  it("rejects unknown keys, over-granting, and actions without view permission", () => {
    expect(() => validatePermissions(["*"], root)).toThrow();
    expect(() => validatePermissions(["finance.view"], manager)).toThrow();
    expect(() => validatePermissions(["rooms.manage"], manager)).toThrow();
    expect(validatePermissions(["rooms.view", "rooms.manage"], manager)).toEqual(["rooms.manage", "rooms.view"]);
  });
  it("maps detail pages and query tabs to their feature permission", () => {
    expect(permissionForPage("/users/USR-123")).toBe("users.view");
    expect(permissionForPage("/users?tab=User%20List")).toBe("users.view");
    expect(canAccessPage(staff, "/events-login")).toBe(false);
    expect(canAccessPage(staff, "/room-management")).toBe(true);
  });
  it("revokes delegated permissions when a parent loses them", async () => {
    const result = await effectiveAdmin(db([root, { ...manager, permissions: ["rooms.view"] }, staff]), "staff");
    expect(result.permissions).toEqual(["rooms.view"]);
  });
  it("rejects suspended ancestry, missing parents and cycles", async () => {
    expect(await effectiveAdmin(db([root, { ...manager, active: false }, staff]), "staff")).toBeNull();
    expect(await effectiveAdmin(db([staff]), "staff")).toBeNull();
    expect(await effectiveAdmin(db([{ ...staff, createdById: "staff" }]), "staff")).toBeNull();
  });
  it("protects self, peers and ancestors but allows a manager to edit descendants", async () => {
    const database = db([root, manager, staff]);
    expect(await canManageStaff(database, manager, manager)).toBe(false);
    expect(await canManageStaff(database, manager, root)).toBe(false);
    expect(await canManageStaff(database, staff, manager)).toBe(false);
    expect(await canManageStaff(database, manager, staff)).toBe(true);
    expect(await canManageStaff(database, root, manager)).toBe(true);
  });
  it("never serializes password hashes", () => {
    expect(staffDto({ ...staff, passwordHash: "secret" })).not.toHaveProperty("passwordHash");
  });
});
