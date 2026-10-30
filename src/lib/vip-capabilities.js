import { prisma } from "./prisma.js";
import { VIP_PRIVILEGES, vipIsActive } from "./vip-contract.js";

const keys = new Set(VIP_PRIVILEGES.map(p => p.key));
export const vipMembershipInclude = { tier: true };
export function vipCapabilities(membership, now = new Date()) {
  if (!vipIsActive(membership, now)) return { vipPrivileges: [], vipLevel: 0, vipNameColor: null, vipXpMultiplierBps: 10000 };
  const vipPrivileges = [...new Set((membership.tier.privileges ?? []).filter(key => keys.has(key)))];
  return { vipPrivileges, vipLevel: membership.tier.level,
    vipNameColor: vipPrivileges.includes("HIGHLIGHT_NAME") ? membership.tier.nameColor ?? "#D946EF" : null,
    vipXpMultiplierBps: vipPrivileges.includes("LEVEL_BOOST") ? membership.tier.xpMultiplierBps ?? 10000 : 10000 };
}
export async function userVip(userId, db = prisma, now = new Date()) {
  return vipCapabilities(await db.vipMembership.findUnique({ where: { userId }, include: vipMembershipInclude }), now);
}
export async function usersVip(userIds, db = prisma, now = new Date()) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await db.vipMembership.findMany({ where: { userId: { in: ids } }, include: vipMembershipInclude });
  const byId = new Map(rows.map(row => [row.userId, row]));
  return new Map(ids.map(id => [id, vipCapabilities(byId.get(id), now)]));
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
  return { revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now }, tier: { active: true, privileges: { has: privilege } } };
}
export function vipPriority(a, b) {
  const level = p => p?.vipPrivileges?.includes("RANKING_PRIORITY") ? p.vipLevel : 0;
  return level(b) - level(a);
}
