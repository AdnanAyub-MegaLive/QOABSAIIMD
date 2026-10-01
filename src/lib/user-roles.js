export const APPLICATION_ROLES = [
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
  return role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
