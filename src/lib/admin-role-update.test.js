import { expect, it } from "vitest";
import { rolesWithOfficial } from "./admin-role-update";
import { APPLICATION_ROLES, normalizeApplicationRoles } from "./user-roles";
it("preserves newly selected roles when an Official flag is supplied", () => {
  expect(rolesWithOfficial(["LISTENER", "BD"], false)).toEqual(["LISTENER", "BD"]);
  expect(rolesWithOfficial(["ADMIN", "CS_LEADER"], true)).toEqual(["ADMIN", "CS_LEADER", "OFFICIAL"]);
  expect(rolesWithOfficial(["RESELLER", "OFFICIAL"], false)).toEqual(["RESELLER"]);
});
it("uses canonical role codes for all profile choices", () => {
  expect(APPLICATION_ROLES).toEqual(expect.arrayContaining(["RESELLER", "CS", "CS_LEADER"]));
  expect(normalizeApplicationRoles(APPLICATION_ROLES)).toEqual(APPLICATION_ROLES);
});
