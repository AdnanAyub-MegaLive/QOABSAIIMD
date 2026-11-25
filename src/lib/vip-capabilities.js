import { prisma } from "./prisma.js";
import { VIP_PRIVILEGES, vipIsActive } from "./vip-contract.js";

const keys = new Set(VIP_PRIVILEGES.map(p => p.key));
export const vipMembershipInclude = { tier: true };
/** Staff-granted privileges (no VIP needed) that the user has not switched off. */
export function grantedActive(user) {
  return (user?.grantedPrivileges ?? []).filter(key => keys.has(key) && !(user.disabledGrantedPrivileges ?? []).includes(key));
}
export function vipCapabilities(membership, now = new Date(), granted = []) {
  if (!vipIsActive(membership, now)) return { vipPrivileges: [...new Set(granted)], vipLevel: 0, vipNameColor: null, vipXpMultiplierBps: 10000 };
  const vipPrivileges = [...new Set([...(membership.tier.privileges ?? []).filter(key => keys.has(key) && !(membership.disabledPrivileges ?? []).includes(key)), ...granted])];
  return { vipPrivileges, vipLevel: membership.tier.level,
    vipNameColor: vipPrivileges.includes("HIGHLIGHT_NAME") ? membership.tier.nameColor ?? "#D946EF" : null,
    vipXpMultiplierBps: vipPrivileges.includes("LEVEL_BOOST") ? membership.tier.xpMultiplierBps ?? 10000 : 10000 };
}
export async function userVip(userId, db = prisma, now = new Date()) {
  const [membership, user] = await Promise.all([db.vipMembership.findUnique({ where: { userId }, include: vipMembershipInclude }),
    db.user?.findUnique?.({ where: { id: userId }, select: { grantedPrivileges: true, disabledGrantedPrivileges: true } })]);
  return vipCapabilities(membership, now, grantedActive(user));
}
export async function usersVip(userIds, db = prisma, now = new Date()) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const [rows, users] = await Promise.all([db.vipMembership.findMany({ where: { userId: { in: ids } }, include: vipMembershipInclude }),
    db.user?.findMany?.({ where: { id: { in: ids }, grantedPrivileges: { isEmpty: false } }, select: { id: true, grantedPrivileges: true, disabledGrantedPrivileges: true } })]);
  const byId = new Map(rows.map(row => [row.userId, row]));
  const grants = new Map((users ?? []).map(u => [u.id, grantedActive(u)]));
  return new Map(ids.map(id => [id, vipCapabilities(byId.get(id), now, grants.get(id) ?? [])]));
}
export async function hasVipPrivilege(userId, privilege, db = prisma) {
  return (await userVip(userId, db)).vipPrivileges.includes(privilege);
}
export function vipError(code) {
  const message = { VIP_PROTECTED: "This VIP is protected. Only the room owner or Portal staff can moderate this user.",
    FOLLOW_FORBIDDEN: "This user does not accept followers.", GIF_ROOM_COVER_REQUIRED: "An active VIP with GIF room covers is required." }[code];
  return Object.assign(new Error(message ?? code), { code, status: 403 });
}
export async function assertVipModeration(db, room, actorId, targetId, privilege) {
  // Portal staff use their separately authenticated/audited admin routes.
  if (actorId !== room.ownerId && await hasVipPrivilege(targetId, privilege, db)) throw vipError("VIP_PROTECTED");
}
export function activeVipWhere(privilege, now = new Date()) {
  return { NOT: { disabledPrivileges: { has: privilege } }, revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now }, tier: { active: true, privileges: { has: privilege } } };
}
export function vipPriority(a, b) {
  const level = p => p?.vipPrivileges?.includes("RANKING_PRIORITY") ? p.vipLevel : 0;
  return level(b) - level(a);
}
