import { applicationRolesWithPermission, normalizeApplicationRoles } from "./user-roles.js";
import { normalizeSignupCountry } from "./geo-country.js";

export function rolesWithOfficial(roles, isOfficial) {
  const next = new Set(normalizeApplicationRoles(roles));
  if (isOfficial) next.add("OFFICIAL");
  else next.delete("OFFICIAL");
  return normalizeApplicationRoles([...next]);
}

export function referenceRoleNeedsCountry(currentRoles, nextRoles, country, countryChanged = false) {
  const reference = new Set(applicationRolesWithPermission("agencies.reference"));
  const current = new Set(normalizeApplicationRoles(currentRoles ?? []));
  const next = normalizeApplicationRoles(nextRoles ?? []).filter(role => reference.has(role));
  if (!next.length || normalizeSignupCountry(country)) return false;
  return countryChanged || next.some(role => !current.has(role));
}
