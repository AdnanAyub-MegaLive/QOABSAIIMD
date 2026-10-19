import { applicationRolesWithPermission, agencyReferenceRole, displayApplicationRole } from "./user-roles.js";
import { normalizeSignupCountry } from "./geo-country.js";

export function referenceError(status = 422) {
  throw Object.assign(new Error("The reference must be an active, eligible user assigned to the agency country."), { code: "BD_REFERENCE_INVALID", status });
}
export function validateAgencyReference(user, country) {
  if (!user) referenceError(404);
  const canonical = normalizeSignupCountry(country);
  if (!canonical || normalizeSignupCountry(user.country) !== canonical || user.status !== "ACTIVE" || user.deletedAt || !agencyReferenceRole(user)) referenceError();
  return user;
}
export async function findAgencyReference(db, publicId, country) {
  const user = await db.user.findUnique({ where: { publicId: String(publicId ?? "").trim() } });
  return validateAgencyReference(user, country);
}
export function referenceWhere(country, q = "") {
  const canonical = normalizeSignupCountry(country);
  return { status: "ACTIVE", deletedAt: null, country: canonical ?? "__UNASSIGNED__", appRoles: { hasSome: applicationRolesWithPermission("agencies.reference") },
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { publicId: { contains: q, mode: "insensitive" } }] } : {}) };
}
export function referenceDto(user, perks = new Map()) {
  if (!user) return null;
  const role = agencyReferenceRole(user);
  return { publicId: user.publicId, name: user.name, profileImage: user.profileImage ?? null, frameUrl: perks.get(user.publicId)?.frameUrl ?? null, role, roleLabel: role === "BD" ? "BD Admin" : role ? displayApplicationRole(role) : null, country: normalizeSignupCountry(user.country) };
}
