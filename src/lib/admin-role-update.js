import { normalizeApplicationRoles } from "./user-roles.js";

export function rolesWithOfficial(roles, isOfficial) {
  const next = new Set(normalizeApplicationRoles(roles));
  if (isOfficial) next.add("OFFICIAL");
  else next.delete("OFFICIAL");
  return normalizeApplicationRoles([...next]);
}
