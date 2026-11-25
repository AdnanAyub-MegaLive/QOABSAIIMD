import { prisma } from "./prisma.js";

import { REGION_COUNTRIES } from "./staff-regions.js";
export { REGION_COUNTRIES };
const fail = (message, status = 403, code = "OUT_OF_REGION") => { throw Object.assign(new Error(message), { status, code }); };

export function normalizeCountries(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 50) fail("Select countries from the list.", 422, "VALIDATION_ERROR");
  const out = [...new Set(value.map(String).map(s => s.trim()))].filter(Boolean);
  if (out.some(c => !REGION_COUNTRIES[c])) fail("Select countries from the list.", 422, "VALIDATION_ERROR");
  return out.sort();
}

/** Every stored spelling for the admin's countries, or null when unrestricted. */
export function countryValues(admin) {
  const list = admin?.role === "SUPER_ADMIN" ? [] : admin?.allowedCountries ?? [];
  if (!list.length) return null;
  const values = list.flatMap(name => [name, name.toUpperCase(), name.toLowerCase(), ...(REGION_COUNTRIES[name] ?? [])]);
  return [...new Set(values)];
}

export function countryLabel(value) {
  if (!value) return "Unknown";
  const v = String(value).trim();
  for (const [name, codes] of Object.entries(REGION_COUNTRIES)) if (name.toLowerCase() === v.toLowerCase() || codes.includes(v.toUpperCase())) return name;
  return v;
}

/** Prisma `where` fragment limiting users to the admin's countries. */
export function scopedUserWhere(admin) {
  const values = countryValues(admin);
  return values ? { country: { in: values } } : {};
}

export function userInScope(admin, country) {
  const values = countryValues(admin);
  return !values || (country != null && values.includes(String(country).trim()));
}

export async function requireUserInScope(admin, publicId, db = prisma) {
  if (!countryValues(admin)) return;
  const user = typeof publicId === "string" ? await db.user.findUnique({ where: { publicId }, select: { country: true } }) : null;
  if (!user || !userInScope(admin, user.country)) fail("This user is outside your assigned regions.");
}

/** Enforce the admin's longest allowed grant. Returns the minutes to use. */
export function capGrant(admin, { permanent = false, durationMinutes } = {}) {
  const days = admin?.role === "SUPER_ADMIN" ? null : admin?.maxGrantDays;
  if (!days) return durationMinutes;
  if (permanent) fail(`You can only grant for up to ${days} days.`, 403, "GRANT_LIMIT");
  if (durationMinutes != null && durationMinutes > days * 1440) fail(`You can only grant for up to ${days} days.`, 403, "GRANT_LIMIT");
  return durationMinutes;
}
