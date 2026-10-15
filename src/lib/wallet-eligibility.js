// Roles and agency ownership must come from the database, never request input.
export const walletAgencyInclude = { ownedAgency: { select: { status: true } } };
const assignedRoles = new Set(["CREATOR", "HOST", "MODERATOR", "OFFICIAL", "BD", "ADMIN", "JUNIOR_ADMIN", "SENIOR_ADMIN", "SUPER_ADMIN", "COUNTRY_HEAD", "MANAGER"]);

export function walletEligibility(user) {
  const roles = new Set([...(user.appRoles ?? []), user.role]);
  const active = user.status === "ACTIVE" && !user.deletedAt;
  const support = roles.has("CS") || roles.has("CS_LEADER");
  const reseller = roles.has("RESELLER");
  const salaryEligible = user.ownedAgency?.status === "ACTIVE";
  const cashOut = active && !support && (reseller || salaryEligible || [...roles].some(role => assignedRoles.has(role)));
  return {
    exchange: active && (support || !reseller),
    transfer: cashOut,
    withdraw: cashOut,
  };
}
