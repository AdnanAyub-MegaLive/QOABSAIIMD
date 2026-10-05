import { prisma } from "./prisma.js";
import { MANAGEMENT_ROLE_ORDER, managementRole, displayApplicationRole } from "./user-roles.js";
import { normalizeSignupCountry } from "./geo-country.js";
import { resolveUserPerks } from "./user-perks.js";

export const teamSelect = { id: true, publicId: true, name: true, profileImage: true, country: true, appRoles: true, status: true, deletedAt: true, supervisorUserId: true, teamRole: true, countryHeadDesignation: true };
export function teamError(code, status, message) { throw Object.assign(new Error(message), { code, status }); }
export function canSupervise(supervisorRole, memberRole) {
  const a = MANAGEMENT_ROLE_ORDER.indexOf(supervisorRole), b = MANAGEMENT_ROLE_ORDER.indexOf(memberRole);
  return a >= 0 && b > a;
}
export async function requireTeamManager(db, userId) {
  const user = await db.user.findUnique({ where: { id: userId }, select: teamSelect });
  const role = managementRole(user);
  if (!user || user.deletedAt || user.status !== "ACTIVE" || !role || role === "BD") teamError("TEAM_ROLE_NOT_ALLOWED", 403, "A management role is required.");
  return user;
}
export async function teamPolicy(db = prisma) {
  return await db.teamPolicy.findUnique({ where: { id: "GLOBAL" } }) ?? { limitScope: "DIRECT", allowAncestorRemoval: false };
}
export async function subtree(db, userId) {
  const seen = new Set([userId]), rows = []; let frontier = [userId];
  while (frontier.length) {
    const children = await db.user.findMany({ where: { supervisorUserId: { in: frontier } }, select: teamSelect });
    frontier = [];
    for (const child of children) if (!seen.has(child.id)) { seen.add(child.id); rows.push(child); frontier.push(child.id); }
  }
  return rows;
}
export function countRole(members, rootId, role, scope) {
  // Assigned team role defines capacity even if the account is inactive or later changes roles.
  return members.filter(m => (scope === "SUBTREE" || m.supervisorUserId === rootId) && (m.teamRole ?? managementRole(m)) === role).length;
}
export async function teamRules(db, user) {
  return db.roleTeamLimit.findMany({ where: { supervisorRole: managementRole(user) }, orderBy: { memberRole: "asc" } });
}
export async function teamPeople(rows, origin, supervisorMap = new Map()) {
  const perks = await resolveUserPerks(rows, origin, ["FRAMES"]);
  return rows.map(user => {
    const role = user.teamRole ?? managementRole(user);
    return { publicId: user.publicId, name: user.name, profileImage: user.profileImage ?? null, frameUrl: perks.get(user.publicId)?.frameUrl ?? null, role, roleLabel: role ? displayApplicationRole(role) : null, country: user.country, supervisorId: supervisorMap.get(user.supervisorUserId) ?? null, status: user.status, countryHeadDesignation: user.countryHeadDesignation ?? null };
  });
}
export async function readTeam(userId, origin, db = prisma) {
  const snapshot = await db.$transaction(async tx => {
    const me = await requireTeamManager(tx, userId);
    const [members, rules, policy] = await Promise.all([subtree(tx, me.id), teamRules(tx, me), teamPolicy(tx)]);
    return { me, members, rules, policy };
  }, { isolationLevel: "RepeatableRead" });
  const { me, members, rules, policy } = snapshot;
  const country = normalizeSignupCountry(me.country);
  const visible = members.filter(m => !m.deletedAt && country && normalizeSignupCountry(m.country) === country);
  const map = new Map([me, ...visible].map(m => [m.id, m.publicId]));
  const [person] = await teamPeople([{ ...me, teamRole: null }], origin, map);
  return { me: person, limits: rules.filter(r => canSupervise(managementRole(me), r.memberRole)).map(r => ({ role: r.memberRole, roleLabel: displayApplicationRole(r.memberRole), used: countRole(members, me.id, r.memberRole, policy.limitScope), max: r.max })), members: await teamPeople(visible, origin, map), policy: { limitScope: policy.limitScope, allowAncestorRemoval: policy.allowAncestorRemoval } };
}
export async function teamCandidates(userId, role, q, origin, db = prisma) {
  const me = await requireTeamManager(db, userId);
  if (!canSupervise(managementRole(me), role)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "You cannot supervise this role.");
  const rule = await db.roleTeamLimit.findUnique({ where: { supervisorRole_memberRole: { supervisorRole: managementRole(me), memberRole: role } } });
  if (!rule || !canSupervise(managementRole(me), role)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "You cannot supervise this role.");
  const country = normalizeSignupCountry(me.country);
  if (!country) return [];
  const users = await db.user.findMany({ where: { id: { not: me.id }, deletedAt: null, status: "ACTIVE", country, supervisorUserId: null, appRoles: { has: role }, ...(q ? { OR: [{ publicId: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}) }, select: teamSelect, orderBy: { publicId: "asc" }, take: 100 });
  return teamPeople(users.filter(u => canSupervise(managementRole(me), managementRole(u))).map(u => ({ ...u, teamRole: role })), origin);
}
export async function assignTeamMember(userId, publicId, role, db = prisma) {
  return db.$transaction(async tx => {
    const me = await requireTeamManager(tx, userId), policy = await teamPolicy(tx);
    const target = await tx.user.findUnique({ where: { publicId }, select: teamSelect });
    const rule = await tx.roleTeamLimit.findUnique({ where: { supervisorRole_memberRole: { supervisorRole: managementRole(me), memberRole: role } } });
    if (!target || target.deletedAt || target.status !== "ACTIVE" || !rule || !target.appRoles.includes(role) || !canSupervise(managementRole(me), role) || !canSupervise(managementRole(me), managementRole(target))) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "The requested reporting role is not allowed.");
    if (!normalizeSignupCountry(me.country) || normalizeSignupCountry(me.country) !== normalizeSignupCountry(target.country)) teamError("TEAM_COUNTRY_MISMATCH", 422, "Team members must be assigned to the same country.");
    if (target.supervisorUserId) teamError("TEAM_MEMBER_TAKEN", 409, "This user already has a supervisor.");
    const incoming = await subtree(tx, target.id);
    if (target.id === me.id || incoming.some(m => m.id === me.id)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "A reporting cycle is not allowed.");
    if (incoming.some(m => normalizeSignupCountry(m.country) !== normalizeSignupCountry(me.country))) teamError("TEAM_COUNTRY_MISMATCH", 422, "The member's existing team contains a different country.");
    const ownMembers = await subtree(tx, me.id);
    const additions = [{ ...target, teamRole: role, supervisorUserId: me.id }, ...incoming];
    const ownRules = await teamRules(tx, me);
    for (const limit of ownRules) if (limit.max !== null && countRole([...ownMembers, ...additions], me.id, limit.memberRole, policy.limitScope) > limit.max) teamError("TEAM_LIMIT_REACHED", 409, `The ${displayApplicationRole(limit.memberRole)} team limit is reached.`);
    if (policy.limitScope === "SUBTREE") {
      const seen = new Set([me.id]); let parentId = me.supervisorUserId;
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        const parent = await tx.user.findUnique({ where: { id: parentId }, select: teamSelect });
        if (!parent) break;
        const [members, rules] = await Promise.all([subtree(tx, parent.id), teamRules(tx, parent)]);
        for (const limit of rules) if (limit.max !== null && countRole([...members, ...additions], parent.id, limit.memberRole, "SUBTREE") > limit.max) teamError("TEAM_LIMIT_REACHED", 409, "An ancestor's team limit is reached.");
        parentId = parent.supervisorUserId;
      }
    }
    const changed = await tx.user.updateMany({ where: { id: target.id, supervisorUserId: null, status: "ACTIVE", deletedAt: null }, data: { supervisorUserId: me.id, teamRole: role } });
    if (!changed.count) teamError("TEAM_MEMBER_TAKEN", 409, "This user already has a supervisor.");
    await tx.auditLog.create({ data: { action: "TEAM_MEMBER_ASSIGNED", category: "USER_MANAGEMENT", entityType: "User", entityId: target.publicId, description: `${me.publicId} assigned ${target.publicId} to their team.`, metadata: { actorUserId: me.id, memberUserId: target.id, role, supervisorUserId: me.id } } });
    return { publicId: target.publicId, supervisorId: me.publicId, role };
  }, { isolationLevel: "Serializable" });
}
export async function removeTeamMember(userId, publicId, db = prisma) {
  return db.$transaction(async tx => {
    const me = await requireTeamManager(tx, userId), policy = await teamPolicy(tx);
    const target = await tx.user.findUnique({ where: { publicId }, select: teamSelect });
    const reachable = target?.supervisorUserId === me.id || (policy.allowAncestorRemoval && (await subtree(tx, me.id)).some(m => m.id === target?.id));
    if (!target || !reachable || !canSupervise(managementRole(me), managementRole(target))) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "Only an authorized supervisor in this reporting chain can remove this member.");
    if (!normalizeSignupCountry(me.country) || normalizeSignupCountry(me.country) !== normalizeSignupCountry(target.country)) teamError("TEAM_COUNTRY_MISMATCH", 422, "Team members must be in the same country.");
    await tx.user.update({ where: { id: target.id }, data: { supervisorUserId: null, teamRole: null } });
    await tx.auditLog.create({ data: { action: "TEAM_MEMBER_REMOVED", category: "USER_MANAGEMENT", entityType: "User", entityId: target.publicId, description: `${me.publicId} removed ${target.publicId} from their reporting chain.`, metadata: { actorUserId: me.id, previousSupervisorUserId: target.supervisorUserId, memberUserId: target.id } } });
    return { publicId: target.publicId, supervisorId: null, removed: true };
  }, { isolationLevel: "Serializable" });
}
