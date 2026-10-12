import { APPLICATION_ROLES, displayApplicationRole } from "./user-roles.js";

export const roleDistribution = role => role === "RESELLER" ? "RESELLER" : `ROLE_${role}`;
export const ROLE_DISTRIBUTIONS = APPLICATION_ROLES.map(roleDistribution);
export function distributionRole(distribution) {
  return APPLICATION_ROLES.find(role => roleDistribution(role) === distribution) ?? null;
}
export function roleArtworkLabel(distribution) {
  const role = distributionRole(distribution);
  return role ? `${displayApplicationRole(role)} role reward` : null;
}
