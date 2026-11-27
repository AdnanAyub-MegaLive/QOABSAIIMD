import { assertCanBecomeReseller, assertRoleSet } from "./reseller-exclusivity.js";
import { resolveRoleTags } from "./role-tags.js";
import { prisma } from "./prisma.js";
import { MANAGEMENT_ROLE_ORDER, managementRole, displayApplicationRole, managementIdentity, normalizeApplicationRoles, primaryLegacyRole } from "./user-roles.js";
import { syncResellerProps } from "./reseller-props.js";
import { countryWhere, normalizeSignupCountry, sameCountry } from "./geo-country.js";
import { resolveUserPerks } from "./user-perks.js";
import { notifyAction } from "./action-notifications.js";
import { randomUUID } from "node:crypto";

export const teamSelect = { companyBdCountry: true, id: true, publicId: true, name: true, profileImage: true, country: true, appRoles: true, status: true, deletedAt: true, supervisorUserId: true, teamRole: true, countryHeadDesignation: true, role: true, isOfficial: true, teamGrantedRole: true };
export function canJoinAs(supervisorRole, target, role) {
  if (!target) return false;
  const current = managementRole(target), hasRole = target.appRoles.includes(role);
  if (!hasRole && (current || target.isOfficial || target.appRoles.includes("OFFICIAL"))) return false;
  return !current || canSupervise(supervisorRole, current);
}
export function teamError(code, status, message) { throw Object.assign(new Error(message), { code, status }); }
export function canSupervise(supervisorRole, memberRole) {
  if (supervisorRole === "CS_LEADER") return memberRole === "CS";
  if (["CS", "CS_LEADER"].includes(memberRole) || supervisorRole === "CS") return false;
  const a = MANAGEMENT_ROLE_ORDER.indexOf(supervisorRole), b = MANAGEMENT_ROLE_ORDER.indexOf(memberRole);
  return a >= 0 && b > a;
}
export async function requireTeamManager(db, userId) {
  const user = await db.user.findUnique({ where: { id: userId }, select: teamSelect });
  const role = managementRole(user);
  if (!user || user.deletedAt || user.status !== "ACTIVE" || !role || ["BD", "CS"].includes(role)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "A management role is required.");
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
  const tags = await resolveRoleTags(rows, origin);
  return rows.map(user => {
    const role = user.teamRole ?? managementRole(user);
    return { roleTags: tags.get(user.publicId) ?? [], publicId: user.publicId, name: user.name, profileImage: user.profileImage ?? null, frameUrl: perks.get(user.publicId)?.frameUrl ?? null, role, roleLabel: role ? displayApplicationRole(role) : null, country: user.country, supervisorId: supervisorMap.get(user.supervisorUserId) ?? null, status: user.status, countryHeadDesignation: user.countryHeadDesignation ?? null };
  });
}
export async function readTeam(userId, origin, db = prisma) {
  const snapshot = await db.$transaction(async tx => {
    const me = await requireTeamManager(tx, userId);
    const [members, rules, policy, outgoing] = await Promise.all([subtree(tx, me.id), teamRules(tx, me), teamPolicy(tx), tx.teamInvitation.findMany({ where: { supervisorUserId: me.id, status: "PENDING", expiresAt: { gt: new Date() } }, include: invitationInclude, orderBy: { createdAt: "desc" } })]);
    return { me, members, rules, policy, outgoing };
  }, { isolationLevel: "RepeatableRead" });
  const { me, members, rules, policy, outgoing } = snapshot;
  const country = normalizeSignupCountry(me.country);
  const visible = members.filter(m => !m.deletedAt && country && normalizeSignupCountry(m.country) === country);
  const map = new Map([me, ...visible].map(m => [m.id, m.publicId]));
  const [person] = await teamPeople([{ ...me, teamRole: null }], origin, map);
  return { me: person, limits: rules.filter(r => canSupervise(managementRole(me), r.memberRole)).map(r => ({ role: r.memberRole, roleLabel: displayApplicationRole(r.memberRole), used: countRole(members, me.id, r.memberRole, policy.limitScope), pending: outgoing.filter(i => i.role === r.memberRole).length, max: r.max })), members: await teamPeople(visible, origin, map), policy: { limitScope: policy.limitScope, allowAncestorRemoval: policy.allowAncestorRemoval }, invitations: { outgoing: await invitationItems(outgoing, origin) } };
}
export async function teamCandidates(userId, role, q, origin, db = prisma) {
  const me = await requireTeamManager(db, userId);
  if (!canSupervise(managementRole(me), role)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "You cannot supervise this role.");
  const rule = await db.roleTeamLimit.findUnique({ where: { supervisorRole_memberRole: { supervisorRole: managementRole(me), memberRole: role } } });
  if (!rule || !canSupervise(managementRole(me), role)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "You cannot supervise this role.");
  const country = normalizeSignupCountry(me.country);
  if (!country) return [];
  const users = await db.user.findMany({ where: { id: { not: me.id }, deletedAt: null, status: "ACTIVE", country: countryWhere(country), supervisorUserId: null, ...(q ? { OR: [{ publicId: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}) }, select: teamSelect, orderBy: { publicId: "asc" }, take: 100 });
  const eligible = users.filter(u => !u.companyBdCountry && sameCountry(u.country, country) && canJoinAs(managementRole(me), u, role));
  const people = await teamPeople(eligible.map(u => ({ ...u, teamRole: role })), origin);
  return people.map((p, i) => ({ ...p, hasRole: eligible[i].appRoles.includes(role) }));
}
export const TEAM_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const invitationPeopleSelect = { id: true, publicId: true, supervisorUserId: true, memberUserId: true, role: true, grantsRole: true, status: true, createdAt: true, respondedAt: true, expiresAt: true };
function roleName(role) { return role ? displayApplicationRole(role) : "Member"; }
function withArticle(label) { return `${/^[AEIOU]/i.test(label) ? "an" : "a"} ${label}`; }
async function applyRoles(tx, user, roles, extra = {}) {
  const appRoles = normalizeApplicationRoles(roles);
  assertRoleSet(appRoles);
  if (appRoles.includes("RESELLER") && !user.appRoles?.includes("RESELLER")) await assertCanBecomeReseller(tx, await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, appRoles: true, agencyId: true } }));
  const updated = await tx.user.update({ where: { id: user.id }, data: { appRoles: { set: appRoles }, role: primaryLegacyRole(appRoles, user.role ?? "LISTENER"), isOfficial: appRoles.includes("OFFICIAL"), ...extra } });
  await syncResellerProps(user.id, tx);
  const fresh = { ...user, ...updated, appRoles };
  await teamRealtime(tx, [user.publicId], "user:roles-changed", { publicId: user.publicId, roles: appRoles, ...managementIdentity(fresh) });
  return fresh;
}
function invitationReceipt(invitation, me, target) {
  return { publicId: target.publicId, userPublicId: target.publicId, supervisorId: me.publicId, role: invitation.role, invitationId: invitation.publicId, status: invitation.status, expiresAt: invitation.expiresAt.toISOString(), grantsRole: Boolean(invitation.grantsRole) };
}
async function teamRealtime(tx, publicIds, event, data) {
  const channels = [...new Set(publicIds.filter(Boolean))];
  if (channels.length) await tx.realtimeOutbox.createMany({ data: channels.map(publicId => ({ channel: `user:${publicId}`, event, payload: { success: true, data } })) });
}
async function expireInvitations(tx, where, now = new Date()) {
  await tx.teamInvitation.updateMany({ where: { ...where, status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", respondedAt: now } });
}
async function checkAssignable(tx, me, target, role, policy, pendingInvitations = []) {
  if (target?.companyBdCountry) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "Official Company BDs belong only to the Company.");
  const rule = await tx.roleTeamLimit.findUnique({ where: { supervisorRole_memberRole: { supervisorRole: managementRole(me), memberRole: role } } });
  if (!target || target.deletedAt || target.status !== "ACTIVE" || !rule || !canSupervise(managementRole(me), role) || !canJoinAs(managementRole(me), target, role)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "The requested reporting role is not allowed.");
  if (!normalizeSignupCountry(me.country) || normalizeSignupCountry(me.country) !== normalizeSignupCountry(target.country)) teamError("TEAM_COUNTRY_MISMATCH", 422, "Team members must be assigned to the same country.");
  if (target.supervisorUserId) teamError("TEAM_MEMBER_TAKEN", 409, "This user already has a supervisor.");
  const incoming = await subtree(tx, target.id);
  if (target.id === me.id || incoming.some(m => m.id === me.id)) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "A reporting cycle is not allowed.");
  if (incoming.some(m => normalizeSignupCountry(m.country) !== normalizeSignupCountry(me.country))) teamError("TEAM_COUNTRY_MISMATCH", 422, "The member's existing team contains a different country.");
  const ownMembers = await subtree(tx, me.id);
  const additions = [{ ...target, teamRole: role, supervisorUserId: me.id }, ...incoming];
  const pending = pendingInvitations.filter(i => i.memberUserId !== target.id).map(i => ({ id: `invitation:${i.memberUserId}`, supervisorUserId: me.id, teamRole: i.role }));
  const ownRules = await teamRules(tx, me);
  for (const limit of ownRules) if (limit.max !== null && countRole([...ownMembers, ...additions, ...pending], me.id, limit.memberRole, policy.limitScope) > limit.max) teamError("TEAM_LIMIT_REACHED", 409, `The ${displayApplicationRole(limit.memberRole)} team limit is reached.`);
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
}
export async function assignTeamMember(userId, publicId, role, db = prisma) {
  const result = await db.$transaction(async tx => {
    const me = await requireTeamManager(tx, userId), policy = await teamPolicy(tx);
    const target = await tx.user.findUnique({ where: { publicId }, select: teamSelect });
    const now = new Date();
    if (target) await expireInvitations(tx, { memberUserId: target.id }, now);
    await expireInvitations(tx, { supervisorUserId: me.id }, now);
    const pendingInvitations = await tx.teamInvitation.findMany({ where: { supervisorUserId: me.id, status: "PENDING" }, select: invitationPeopleSelect });
    await checkAssignable(tx, me, target, role, policy, pendingInvitations);
    const existing = await tx.teamInvitation.findFirst({ where: { memberUserId: target.id, status: "PENDING" }, select: invitationPeopleSelect });
    if (existing) {
      if (existing.supervisorUserId === me.id && existing.role === role) return { receipt: invitationReceipt(existing, me, target) };
      teamError("TEAM_INVITATION_PENDING", 409, "This user already has a pending team invitation.");
    }
    const grantsRole = !target.appRoles.includes(role);
    const invitation = await tx.teamInvitation.create({ data: { publicId: `TIV-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`, supervisorUserId: me.id, memberUserId: target.id, role, grantsRole, status: "PENDING", createdAt: now, expiresAt: new Date(now.getTime() + TEAM_INVITATION_TTL_MS) }, select: invitationPeopleSelect });
    const supervisorRole = managementRole(me);
    await notifyAction(tx, { userId: target.id, key: `team-invitation:${invitation.publicId}:PENDING`, type: "TEAM_INVITATION", title: "Team invitation", body: grantsRole ? `${me.name || me.publicId} (${roleName(supervisorRole)}) wants you to join their team as ${roleName(role)}. You will become ${withArticle(roleName(role))} after accepting.` : `${me.name || me.publicId} (${roleName(supervisorRole)}) wants to add you to their team as ${roleName(role)}.`, action: { screen: "TEAM_INVITATION", invitationId: invitation.publicId, supervisorPublicId: me.publicId, role, grantsRole } });
    await teamRealtime(tx, [target.publicId], "team:invitation", { invitationId: invitation.publicId, status: "PENDING" });
    await tx.auditLog.create({ data: { action: "TEAM_INVITATION_SENT", category: "USER_MANAGEMENT", entityType: "TeamInvitation", entityId: invitation.publicId, description: `${me.publicId} invited ${target.publicId} to their team.`, metadata: { actorUserId: me.id, memberUserId: target.id, role, grantsRole, supervisorUserId: me.id } } });
    return { receipt: invitationReceipt(invitation, me, target) };
  }, { isolationLevel: "Serializable" });
  return result.receipt;
}
export async function respondTeamInvitation(userId, invitationId, action, db = prisma) {
  if (!["ACCEPT", "DECLINE", "CANCEL"].includes(action)) teamError("TEAM_INPUT_INVALID", 422, "Action must be ACCEPT, DECLINE or CANCEL.");
  const result = await db.$transaction(async tx => {
    const invitation = await tx.teamInvitation.findUnique({ where: { publicId: invitationId }, select: invitationPeopleSelect });
    const allowed = invitation && (action === "CANCEL" ? invitation.supervisorUserId === userId : invitation.memberUserId === userId);
    if (!allowed) teamError("TEAM_INVITATION_NOT_FOUND", 404, "This team invitation was not found.");
    if (invitation.status !== "PENDING") teamError("TEAM_INVITATION_CLOSED", 409, `This team invitation is already ${invitation.status.toLowerCase()}.`);
    const now = new Date();
    const [supervisor, member] = await Promise.all([tx.user.findUnique({ where: { id: invitation.supervisorUserId }, select: teamSelect }), tx.user.findUnique({ where: { id: invitation.memberUserId }, select: teamSelect })]);
    const close = async status => {
      const changed = await tx.teamInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status, respondedAt: now } });
      if (!changed.count) teamError("TEAM_INVITATION_CLOSED", 409, "This team invitation is no longer pending.");
    };
    const realtime = status => teamRealtime(tx, [supervisor?.publicId, member?.publicId], "team:invitation", { invitationId: invitation.publicId, status });
    if (invitation.expiresAt <= now) {
      await close("EXPIRED"); await realtime("EXPIRED");
      return { error: { code: "TEAM_INVITATION_EXPIRED", status: 409, message: "This team invitation has expired." } };
    }
    if (action === "ACCEPT") {
      try {
        const me = await requireTeamManager(tx, supervisor?.id);
        await checkAssignable(tx, me, member, invitation.role, await teamPolicy(tx));
      } catch (error) {
        if (!error.code?.startsWith("TEAM_") || error.code === "TEAM_LIMIT_REACHED") throw error;
        await close("EXPIRED"); await realtime("EXPIRED");
        return { error: { code: error.code, status: error.status, message: `${error.message} This invitation is no longer valid.` } };
      }
      const changed = await tx.user.updateMany({ where: { id: member.id, supervisorUserId: null, status: "ACTIVE", deletedAt: null }, data: { supervisorUserId: supervisor.id, teamRole: invitation.role } });
      if (!changed.count) teamError("TEAM_MEMBER_TAKEN", 409, "This user already has a supervisor.");
      const grantedRole = !member.appRoles.includes(invitation.role);
      if (grantedRole) await applyRoles(tx, member, [...member.appRoles, invitation.role], { teamGrantedRole: invitation.role });
      await close("ACCEPTED");
      await tx.auditLog.create({ data: { action: "TEAM_MEMBER_ASSIGNED", category: "USER_MANAGEMENT", entityType: "User", entityId: member.publicId, description: `${supervisor.publicId} assigned ${member.publicId} to their team.`, metadata: { actorUserId: supervisor.id, memberUserId: member.id, role: invitation.role, grantedRole, supervisorUserId: supervisor.id, invitationId: invitation.publicId } } });
      await notifyAction(tx, { userId: supervisor.id, key: `team-invitation:${invitation.publicId}:ACCEPTED`, type: "TEAM_INVITATION_ACCEPTED", title: "Team invitation accepted", body: `${member.name || member.publicId} accepted your team invitation`, action: { screen: "TEAM", invitationId: invitation.publicId, memberPublicId: member.publicId, role: invitation.role } });
      await realtime("ACCEPTED");
      await teamRealtime(tx, [supervisor.publicId, member.publicId], "team:changed", { status: "ASSIGNED", memberPublicId: member.publicId, supervisorPublicId: supervisor.publicId, role: invitation.role });
      return { data: { invitationId: invitation.publicId, status: "ACCEPTED", publicId: member.publicId, supervisorId: supervisor.publicId, role: invitation.role, grantedRole } };
    }
    const status = action === "DECLINE" ? "DECLINED" : "CANCELLED";
    await close(status);
    if (action === "DECLINE") await notifyAction(tx, { userId: supervisor.id, key: `team-invitation:${invitation.publicId}:DECLINED`, type: "TEAM_INVITATION_DECLINED", title: "Team invitation declined", body: `${member.name || member.publicId} declined your team invitation`, action: { screen: "TEAM", invitationId: invitation.publicId, memberPublicId: member.publicId, role: invitation.role } });
    else await notifyAction(tx, { userId: member.id, key: `team-invitation:${invitation.publicId}:CANCELLED`, type: "TEAM_INVITATION_CANCELLED", title: "Team invitation cancelled", body: `${supervisor.name || supervisor.publicId} cancelled their team invitation`, action: { screen: "TEAM_INVITATION", invitationId: invitation.publicId, supervisorPublicId: supervisor.publicId, role: invitation.role } });
    await realtime(status);
    return { data: { invitationId: invitation.publicId, status, publicId: member.publicId, supervisorId: supervisor.publicId, role: invitation.role } };
  }, { isolationLevel: "Serializable" });
  if (result.error) teamError(result.error.code, result.error.status, result.error.message);
  return result.data;
}
async function invitationItems(rows, origin) {
  const pick = p => p && { publicId: p.publicId, name: p.name, profileImage: p.profileImage, frameUrl: p.frameUrl, role: p.role, roleLabel: p.roleLabel, country: p.country };
  const people = await teamPeople([...rows.map(r => ({ ...r.supervisor, teamRole: null })), ...rows.map(r => ({ ...r.member, teamRole: r.role }))], origin);
  return rows.map((r, i) => ({ invitationId: r.publicId, role: r.role, roleLabel: roleName(r.role), grantsRole: Boolean(r.grantsRole), status: r.status, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), supervisor: pick(people[i]), member: pick(people[rows.length + i]) }));
}
const invitationInclude = { supervisor: { select: teamSelect }, member: { select: teamSelect } };
export async function listTeamInvitations(userId, origin, db = prisma) {
  const now = new Date();
  const [incoming, outgoing] = await db.$transaction(async tx => {
    await expireInvitations(tx, { OR: [{ memberUserId: userId }, { supervisorUserId: userId }] }, now);
    return Promise.all([
      tx.teamInvitation.findMany({ where: { memberUserId: userId, status: "PENDING", expiresAt: { gt: now } }, include: invitationInclude, orderBy: { createdAt: "desc" } }),
      tx.teamInvitation.findMany({ where: { supervisorUserId: userId, status: "PENDING", expiresAt: { gt: now } }, include: invitationInclude, orderBy: { createdAt: "desc" } }),
    ]);
  });
  return { incoming: await invitationItems(incoming, origin), outgoing: await invitationItems(outgoing, origin) };
}
export async function removeTeamMember(userId, publicId, db = prisma) {
  return db.$transaction(async tx => {
    const me = await requireTeamManager(tx, userId), policy = await teamPolicy(tx);
    const target = await tx.user.findUnique({ where: { publicId }, select: teamSelect });
    const reachable = target?.supervisorUserId === me.id || (policy.allowAncestorRemoval && (await subtree(tx, me.id)).some(m => m.id === target?.id));
    if (!target || !reachable || !canSupervise(managementRole(me), managementRole(target))) teamError("TEAM_ROLE_NOT_ALLOWED", 403, "Only an authorized supervisor in this reporting chain can remove this member.");
    if (!normalizeSignupCountry(me.country) || normalizeSignupCountry(me.country) !== normalizeSignupCountry(target.country)) teamError("TEAM_COUNTRY_MISMATCH", 422, "Team members must be in the same country.");
    await tx.user.update({ where: { id: target.id }, data: { supervisorUserId: null, teamRole: null } });
    const granted = target.teamGrantedRole && target.appRoles.includes(target.teamGrantedRole) ? target.teamGrantedRole : null;
    let roleRemoved = false, roleKept = false, reason = null;
    if (granted) {
      const [agencies, members] = await Promise.all([tx.agency.count({ where: { bdUserId: target.id } }), tx.user.count({ where: { supervisorUserId: target.id } })]);
      reason = agencies ? "AGENCIES_ASSIGNED" : members ? "TEAM_MEMBERS_ASSIGNED" : null;
      if (reason) roleKept = true;
      else { await applyRoles(tx, target, target.appRoles.filter(r => r !== granted), { teamGrantedRole: null }); roleRemoved = true; }
    } else if (target.teamGrantedRole) await tx.user.update({ where: { id: target.id }, data: { teamGrantedRole: null } });
    await tx.auditLog.create({ data: { action: "TEAM_MEMBER_REMOVED", category: "USER_MANAGEMENT", entityType: "User", entityId: target.publicId, description: `${me.publicId} removed ${target.publicId} from their reporting chain.`, metadata: { actorUserId: me.id, previousSupervisorUserId: target.supervisorUserId, memberUserId: target.id, teamGrantedRole: granted, roleRemoved, roleKept, reason } } });
    const body = `You were removed from ${me.name || me.publicId}'s team${roleRemoved ? ` and are no longer ${withArticle(roleName(granted))}` : ""}`;
    await notifyAction(tx, { userId: target.id, key: `team-removed:${randomUUID()}`, type: "TEAM_MEMBER_REMOVED", title: "Removed from team", body, action: { screen: "TEAM", supervisorPublicId: me.publicId, roleRemoved, role: granted } });
    await teamRealtime(tx, [target.publicId, me.publicId], "team:changed", { status: "REMOVED", memberPublicId: target.publicId, supervisorPublicId: me.publicId, roleRemoved });
    const message = reason === "AGENCIES_ASSIGNED" ? `Removed from the team. ${roleName(granted)} role kept because agencies are still assigned to this member.` : reason === "TEAM_MEMBERS_ASSIGNED" ? `Removed from the team. ${roleName(granted)} role kept because this member still has team members.` : null;
    return { publicId: target.publicId, supervisorId: null, removed: true, roleRemoved, roleKept, role: granted, reason, message };
  }, { isolationLevel: "Serializable" });
}
