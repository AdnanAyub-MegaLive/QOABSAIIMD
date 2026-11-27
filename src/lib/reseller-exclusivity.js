// A reseller can never be a host or an agency owner, and never receives gifts.
// Hosts and agency owners can never become resellers.
import { isHostUser } from "./user-roles.js";

export const RESELLER_RULES = {
  RESELLER_CANNOT_HOST: "Resellers cannot become hosts or own an agency.",
  HOST_CANNOT_BE_RESELLER: "Active hosts and agency owners cannot become resellers.",
  RESELLER_CANNOT_RECEIVE_GIFTS: "Resellers cannot receive gifts.",
};

export function isReseller(user) {
  return user?.role === "RESELLER" || user?.appRoles?.includes("RESELLER") === true;
}

export function resellerRuleError(code, status = 409) {
  return Object.assign(new Error(RESELLER_RULES[code]), { code, status });
}

/** The user is about to become a host or agency owner. */
export function assertNotReseller(user) {
  if (isReseller(user)) throw resellerRuleError("RESELLER_CANNOT_HOST");
}

/** The user is about to be given the RESELLER role. */
export async function assertCanBecomeReseller(tx, user) {
  if (!user) return;
  if (isHostUser(user) && user.agencyId) throw resellerRuleError("HOST_CANNOT_BE_RESELLER");
  const owned = await tx.agency.findFirst({ where: { ownerUserId: user.id, status: "ACTIVE" }, select: { id: true } });
  if (owned) throw resellerRuleError("HOST_CANNOT_BE_RESELLER");
}

/** Roles being saved together must not combine RESELLER with HOST. */
export function assertRoleSet(roles) {
  if (roles?.includes("RESELLER") && roles.includes("HOST")) throw resellerRuleError("HOST_CANNOT_BE_RESELLER");
}

export function assertGiftableUser(user) {
  if (isReseller(user)) throw resellerRuleError("RESELLER_CANNOT_RECEIVE_GIFTS", 403);
}
