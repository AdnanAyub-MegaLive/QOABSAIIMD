export const APPLICATION_ROLES = [
  "RESELLER",
  "LISTENER",
  "SENDER",
  "CREATOR",
  "HOST",
  "MODERATOR",
  "OFFICIAL",
  "BD",
  "ADMIN",
  "JUNIOR_ADMIN",
  "SENIOR_ADMIN",
  "SUPER_ADMIN",
  "COUNTRY_HEAD",
];

const LEGACY_ROLES = ["HOST", "MODERATOR", "CREATOR", "SENDER", "LISTENER"];

export const APPLICATION_ROLE_PERMISSIONS = {
  BD: ["agencies.reference"], JUNIOR_ADMIN: ["agencies.reference"],
  SENIOR_ADMIN: ["agencies.reference"], SUPER_ADMIN: ["agencies.reference"], COUNTRY_HEAD: ["agencies.reference"],
};
export function applicationRolesWithPermission(permission) {
  return APPLICATION_ROLES.filter(role => APPLICATION_ROLE_PERMISSIONS[role]?.includes(permission));
}
export function agencyReferenceRole(user) {
  return applicationRolesWithPermission("agencies.reference").find(role => user?.appRoles?.includes(role)) ?? null;
}

export function normalizeApplicationRoles(values) {
  const supplied = Array.isArray(values) ? values : [values];
  const normalized = supplied
    .map((value) => String(value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_"))
    .filter((value, index, all) => APPLICATION_ROLES.includes(value) && all.indexOf(value) === index);
  return normalized.length ? normalized : ["LISTENER"];
}

export function primaryLegacyRole(roles, currentRole = "LISTENER") {
  if (roles.includes(currentRole)) return currentRole;
  return LEGACY_ROLES.find((role) => roles.includes(role)) ?? "LISTENER";
}

export function displayApplicationRole(role) {
  if (role === "BD") return "BD";
  return role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
