import { describe, it, expect } from "vitest";
import { referenceWhere, referenceDto, validateAgencyReference } from "./agency-reference.js";
import { applicationRolesWithPermission } from "./user-roles.js";
const user = { publicId: "USR-1", name: "Reference", country: "PK", appRoles: ["BD"], status: "ACTIVE", deletedAt: null };
describe("country-scoped agency references", () => {
  it("supports every configured reference role", () => {
    for (const role of applicationRolesWithPermission("agencies.reference")) expect(validateAgencyReference({ ...user, appRoles: [role] }, "PK")).toBeTruthy();
  });
  it("fails closed for missing, inactive, wrong-country and wrong-role references", () => {
    expect(() => validateAgencyReference(null, "PK")).toThrow(expect.objectContaining({ code: "BD_REFERENCE_INVALID", status: 404 }));
    for (const changed of [{ country: "US" }, { country: null }, { status: "BANNED" }, { deletedAt: new Date() }, { appRoles: ["LISTENER"] }]) expect(() => validateAgencyReference({ ...user, ...changed }, "PK")).toThrow(expect.objectContaining({ code: "BD_REFERENCE_INVALID", status: 422 }));
    expect(() => validateAgencyReference(user, null)).toThrow();
  });
  it("keeps name searches inside country and role restrictions", () => {
    expect(referenceWhere("Pakistan", "Ref")).toMatchObject({ country: "PK", status: "ACTIVE", deletedAt: null, appRoles: { hasSome: applicationRolesWithPermission("agencies.reference") }, OR: [{ name: { contains: "Ref", mode: "insensitive" } }, { publicId: { contains: "Ref", mode: "insensitive" } }] });
    expect(referenceWhere(null).country).toBe("__UNASSIGNED__");
  });
  it("returns explicit frame and role fields", () => {
    expect(referenceDto(user)).toMatchObject({ publicId: "USR-1", role: "BD", roleLabel: "BD Admin", country: "PK", frameUrl: null });
    expect(referenceDto(user, new Map([[user.publicId, { frameUrl: "https://portal/frame" }]] )).frameUrl).toBe("https://portal/frame");
  });
});
