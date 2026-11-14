import { expect, it, vi } from "vitest";
vi.mock("./role-tags.js", () => ({ resolveRoleTags: async () => new Map() }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: async () => new Map() }));
vi.mock("./reseller-props.js", () => ({ syncResellerProps: vi.fn(async () => {}) }));
import { assignTeamMember, removeTeamMember, readTeam, teamCandidates, countRole, respondTeamInvitation, listTeamInvitations } from "./management-team.js";
import { managementIdentity } from "./user-roles.js";

const person = (id, role, supervisorUserId = null, country = "PK") => ({ id, publicId: `USR-${id}`, name: id, appRoles: [role], country, status: "ACTIVE", deletedAt: null, supervisorUserId, teamRole: supervisorUserId ? role : null });
function matches(row, where) {
  return Object.entries(where).every(([k, v]) => k === "OR" ? v.some(w => matches(row, w)) : v && typeof v === "object" && !(v instanceof Date) ? (v.lte ? row[k] <= v.lte : v.gt ? row[k] > v.gt : true) : row[k] === v);
}
function fixture(users, rules, policy = { limitScope: "DIRECT", allowAncestorRemoval: false }) {
  const invitations = [];
  const withPeople = r => ({ ...r, supervisor: users.find(u => u.id === r.supervisorUserId), member: users.find(u => u.id === r.memberUserId) });
  const db = {
    invitations,
    teamInvitation: {
      findMany: async ({ where, include }) => invitations.filter(r => matches(r, where)).map(r => include ? withPeople(r) : { ...r }),
      findFirst: async ({ where }) => invitations.find(r => matches(r, where)) ?? null,
      findUnique: async ({ where }) => invitations.find(r => r.publicId === where.publicId) ?? null,
      create: async ({ data }) => { const row = { id: `inv${invitations.length}`, respondedAt: null, ...data }; invitations.push(row); return { ...row }; },
      updateMany: async ({ where, data }) => { const rows = invitations.filter(r => matches(r, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length }; },
    },
    notification: { upsert: vi.fn(async ({ create }) => create) }, realtimeOutbox: { createMany: vi.fn() },
    user: {
      findUnique: async ({ where }) => users.find(u => where.id ? u.id === where.id : u.publicId === where.publicId),
      findMany: vi.fn(async ({ where }) => users.filter(u => where.supervisorUserId?.in ? where.supervisorUserId.in.includes(u.supervisorUserId) : u.supervisorUserId === null && (typeof where.country === "string" ? u.country === where.country : where.country.in.some(v => v.toLowerCase() === String(u.country).toLowerCase())) && u.status === "ACTIVE" && !u.deletedAt && u.id !== where.id.not && (!where.OR || u.publicId.toLowerCase().includes(where.OR[0].publicId.contains.toLowerCase()) || u.name.toLowerCase().includes(where.OR[1].name.contains.toLowerCase())))),
      updateMany: async ({ where, data }) => { const u = users.find(u => u.id === where.id && u.supervisorUserId === null); if (!u) return { count: 0 }; Object.assign(u, data); return { count: 1 }; },
      update: async ({ where, data }) => Object.assign(users.find(u => u.id === where.id), Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && v.set ? v.set : v]))),
      count: async ({ where }) => users.filter(u => u.supervisorUserId === where.supervisorUserId).length,
    },
    roleTeamLimit: { findUnique: async ({ where }) => rules.find(r => r.supervisorRole === where.supervisorRole_memberRole.supervisorRole && r.memberRole === where.supervisorRole_memberRole.memberRole), findMany: async ({ where }) => rules.filter(r => r.supervisorRole === where.supervisorRole) },
    agency: { count: async ({ where }) => (db.agencies ?? []).filter(a => a.bdUserId === where.bdUserId).length },
    teamPolicy: { findUnique: async () => policy }, auditLog: { create: vi.fn() },
  };
  db.$transaction = vi.fn(work => work(db)); return db;
}
const rule = (supervisorRole, memberRole, max) => ({ supervisorRole, memberRole, max });
it("Company BDs cannot join any manager's team", async () => {
  const users=[person("a","COUNTRY_HEAD"),{...person("company","BD"),companyBdCountry:"PK"}];
  const db=fixture(users,[rule("COUNTRY_HEAD","BD",null)]);
  await expect(assignTeamMember("a","USR-company","BD",db)).rejects.toMatchObject({code:"TEAM_ROLE_NOT_ALLOWED"});
  expect(await teamCandidates("a","BD","",null,db)).toEqual([]);
  expect(users[1].supervisorUserId).toBeNull();
});
it("CS leaders assign only CS and see their team count without business permissions", async () => {
  const users=[person("leader","CS_LEADER"),person("cs","CS"),person("bd","BD")];
  const db=fixture(users,[rule("CS_LEADER","CS",null),rule("CS_LEADER","BD",null)]);
  const receipt=await assignTeamMember("leader","USR-cs","CS",db);
  await respondTeamInvitation("cs",receipt.invitationId,"ACCEPT",db);
  const result=await readTeam("leader","https://portal.example",db);
  expect(result.limits).toEqual([{role:"CS",roleLabel:"Customer Support",used:1,pending:0,max:null}]);
  expect(result.members).toHaveLength(1);
  await expect(assignTeamMember("leader","USR-bd","BD",db)).rejects.toMatchObject({code:"TEAM_ROLE_NOT_ALLOWED"});
  expect(managementIdentity(users[0]).management.permissions).toEqual(["team.view","team.assign","team.remove"]);
});
it("uses database quotas, audits assignment and rejects taken members", async () => {
  const users = [person("a", "ADMIN"), person("b", "BD"), person("c", "BD")];
  const db = fixture(users, [rule("ADMIN", "BD", 1)]);
  const receipt = await assignTeamMember("a", "USR-b", "BD", db);
  expect(receipt).toMatchObject({ publicId: "USR-b", userPublicId: "USR-b", supervisorId: "USR-a", role: "BD", status: "PENDING" });
  await expect(assignTeamMember("a", "USR-c", "BD", db)).rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
  await respondTeamInvitation("b", receipt.invitationId, "ACCEPT", db);
  expect(db.auditLog.create.mock.calls.map(c => c[0].data.action)).toEqual(["TEAM_INVITATION_SENT", "TEAM_MEMBER_ASSIGNED"]);
  await expect(assignTeamMember("a", "USR-b", "BD", db)).rejects.toMatchObject({ code: "TEAM_MEMBER_TAKEN", status: 409 });
  await expect(assignTeamMember("a", "USR-c", "BD", db)).rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
  expect(db.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
});
it("rejects wrong country, role, and inactive accounts", async () => {
  const users = [person("a", "ADMIN"), person("b", "BD", null, "US"), person("c", "SUPER_ADMIN")];
  const db = fixture(users, [rule("ADMIN", "BD", null)]);
  await expect(assignTeamMember("a", "USR-b", "BD", db)).rejects.toMatchObject({ code: "TEAM_COUNTRY_MISMATCH" });
  await expect(assignTeamMember("a", "USR-c", "BD", db)).rejects.toMatchObject({ code: "TEAM_ROLE_NOT_ALLOWED" });
  users[1].country = "PK"; users[1].status = "BANNED";
  await expect(assignTeamMember("a", "USR-b", "BD", db)).rejects.toMatchObject({ code: "TEAM_ROLE_NOT_ALLOWED" });
});
it("counts direct reports versus subtree and enforces ancestor quotas", async () => {
  const users = [person("j", "JUNIOR_ADMIN"), person("a", "ADMIN", "j"), person("b", "BD", "j"), person("c", "BD")];
  const db = fixture(users, [rule("ADMIN", "BD", 2), rule("JUNIOR_ADMIN", "BD", 1)], { limitScope: "SUBTREE", allowAncestorRemoval: false });
  await expect(assignTeamMember("a", "USR-c", "BD", db)).rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
  expect(countRole([person("x", "BD", "a")], "j", "BD", "DIRECT")).toBe(0);
  expect(countRole([person("x", "BD", "a")], "j", "BD", "SUBTREE")).toBe(1);
});
it("removes only a direct member by default, retaining that member's team", async () => {
  const users = [person("j", "JUNIOR_ADMIN"), person("a", "ADMIN", "j"), person("b", "BD", "a")];
  const policy = { limitScope: "DIRECT", allowAncestorRemoval: false }, db = fixture(users, [], policy);
  await expect(removeTeamMember("j", "USR-b", db)).rejects.toMatchObject({ code: "TEAM_ROLE_NOT_ALLOWED" });
  await removeTeamMember("j", "USR-a", db);
  expect(users[1].supervisorUserId).toBeNull(); expect(users[2].supervisorUserId).toBe("a");
  users[1].supervisorUserId = "j"; policy.allowAncestorRemoval = true;
  await removeTeamMember("j", "USR-b", db); expect(users[2].supervisorUserId).toBeNull();
});
it("returns the whole tree and scoped candidates with nullable decoration fields", async () => {
  const db = fixture([person("j", "JUNIOR_ADMIN"), person("a", "ADMIN", "j"), person("b", "BD", "a"), person("c", "BD"), person("d", "BD", null, "pakistan"), person("foreign", "BD", null, "US")], [rule("JUNIOR_ADMIN", "BD", 4)]);
  const team = await readTeam("j", "https://portal.test", db);
  expect(team.members).toHaveLength(2); expect(team.members[1]).toMatchObject({ supervisorId: "USR-a", frameUrl: null });
  expect(team.limits[0].used).toBe(0);
  expect((await teamCandidates("j", "BD", "", "https://portal.test", db)).map(u => u.publicId)).toEqual(["USR-c", "USR-d"]);
  await expect(teamCandidates("j", "INVALID", "", "", db)).rejects.toMatchObject({ code: "TEAM_ROLE_NOT_ALLOWED" });
});
it("advertises management roles without granting portal administrator access", () => {
  expect(managementIdentity(person("m", "MANAGER")).management.enabled).toBe(true);
  const bd = managementIdentity(person("b", "BD")).management;
  expect(bd.enabled).toBe(true);
  expect(bd.permissions).toContain("performance.view");
  expect(bd.permissions).not.toContain("team.assign");
  expect(bd.portal.enabled).toBe(false);
});
it("invites instead of assigning, notifies the member and enforces one pending invitation", async () => {
  const users = [person("a", "ADMIN"), person("a2", "ADMIN"), { ...person("b", "BD"), name: "Bee" }];
  users[0].name = "Ali";
  const db = fixture(users, [rule("ADMIN", "BD", null)]);
  const receipt = await assignTeamMember("a", "USR-b", "BD", db);
  expect(receipt.invitationId).toMatch(/^TIV-[0-9A-F]{12}$/);
  expect(new Date(receipt.expiresAt) - Date.now()).toBeGreaterThan(6.9 * 86400000);
  expect(users[2].supervisorUserId).toBeNull();
  expect(db.notification.upsert.mock.calls[0][0].create).toMatchObject({ userId: "b", type: "TEAM_INVITATION", title: "Team invitation", body: "Ali (Admin) wants to add you to their team as BD.", action: { screen: "TEAM_INVITATION", invitationId: receipt.invitationId, supervisorPublicId: "USR-a", role: "BD" } });
  expect(db.realtimeOutbox.createMany.mock.calls[0][0].data).toEqual([{ channel: "user:USR-b", event: "team:invitation", payload: { success: true, data: { invitationId: receipt.invitationId, status: "PENDING" } } }]);
  expect(await assignTeamMember("a", "USR-b", "BD", db)).toEqual(receipt);
  await expect(assignTeamMember("a2", "USR-b", "BD", db)).rejects.toMatchObject({ code: "TEAM_INVITATION_PENDING", status: 409 });
  const team = await readTeam("a", "", db);
  expect(team.limits[0]).toMatchObject({ used: 0, pending: 1 });
  expect(team.invitations.outgoing[0]).toMatchObject({ invitationId: receipt.invitationId, status: "PENDING", member: { publicId: "USR-b", role: "BD" }, supervisor: { publicId: "USR-a" } });
  expect((await listTeamInvitations("b", "", db)).incoming).toHaveLength(1);
  await expect(respondTeamInvitation("a", receipt.invitationId, "ACCEPT", db)).rejects.toMatchObject({ code: "TEAM_INVITATION_NOT_FOUND" });
  await expect(respondTeamInvitation("b", receipt.invitationId, "CANCEL", db)).rejects.toMatchObject({ code: "TEAM_INVITATION_NOT_FOUND" });
  expect(await respondTeamInvitation("b", receipt.invitationId, "DECLINE", db)).toMatchObject({ status: "DECLINED" });
  expect(db.notification.upsert.mock.calls.at(-1)[0].create).toMatchObject({ userId: "a", type: "TEAM_INVITATION_DECLINED", body: "Bee declined your team invitation" });
  await expect(respondTeamInvitation("b", receipt.invitationId, "ACCEPT", db)).rejects.toMatchObject({ code: "TEAM_INVITATION_CLOSED" });
  const second = await assignTeamMember("a2", "USR-b", "BD", db);
  expect(await respondTeamInvitation("a2", second.invitationId, "CANCEL", db)).toMatchObject({ status: "CANCELLED" });
  expect(db.notification.upsert.mock.calls.at(-1)[0].create).toMatchObject({ userId: "b", type: "TEAM_INVITATION_CANCELLED" });
});
it("accepting assigns, rechecks eligibility and expires stale invitations", async () => {
  const users = [person("a", "ADMIN"), person("b", "BD"), person("c", "BD"), person("d", "BD")];
  const db = fixture(users, [rule("ADMIN", "BD", null)]);
  const first = await assignTeamMember("a", "USR-b", "BD", db);
  expect(await respondTeamInvitation("b", first.invitationId, "ACCEPT", db)).toEqual({ invitationId: first.invitationId, status: "ACCEPTED", publicId: "USR-b", supervisorId: "USR-a", role: "BD", grantedRole: false });
  expect(users[1]).toMatchObject({ supervisorUserId: "a", teamRole: "BD" });
  expect(db.notification.upsert.mock.calls.at(-1)[0].create).toMatchObject({ userId: "a", type: "TEAM_INVITATION_ACCEPTED", body: "b accepted your team invitation" });
  expect(db.realtimeOutbox.createMany.mock.calls.at(-1)[0].data.map(r => [r.channel, r.event, r.payload.data.status])).toEqual([["user:USR-a", "team:changed", "ASSIGNED"], ["user:USR-b", "team:changed", "ASSIGNED"]]);
  const moved = await assignTeamMember("a", "USR-c", "BD", db);
  users[2].country = "US";
  await expect(respondTeamInvitation("c", moved.invitationId, "ACCEPT", db)).rejects.toMatchObject({ code: "TEAM_COUNTRY_MISMATCH" });
  expect(db.invitations.find(i => i.publicId === moved.invitationId).status).toBe("EXPIRED");
  const old = await assignTeamMember("a", "USR-d", "BD", db);
  db.invitations.find(i => i.publicId === old.invitationId).expiresAt = new Date(Date.now() - 1000);
  await expect(respondTeamInvitation("d", old.invitationId, "ACCEPT", db)).rejects.toMatchObject({ code: "TEAM_INVITATION_EXPIRED", status: 409 });
  expect(users[3].supervisorUserId).toBeNull();
  expect((await listTeamInvitations("d", "", db)).incoming).toEqual([]);
});
it("keeps an invitation pending when a limit blocks acceptance", async () => {
  const users = [person("a", "ADMIN"), person("b", "BD"), person("c", "BD", "a")];
  const limits = [rule("ADMIN", "BD", 2)], db = fixture(users, limits);
  const receipt = await assignTeamMember("a", "USR-b", "BD", db);
  limits[0].max = 1;
  await expect(respondTeamInvitation("b", receipt.invitationId, "ACCEPT", db)).rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
  expect(db.invitations[0].status).toBe("PENDING");
});
it("notifies a removed member", async () => {
  const users = [{ ...person("a", "ADMIN"), name: "Ali" }, person("b", "BD", "a")];
  const db = fixture(users, []);
  await removeTeamMember("a", "USR-b", db);
  expect(db.notification.upsert.mock.calls[0][0].create).toMatchObject({ userId: "b", type: "TEAM_MEMBER_REMOVED", body: "You were removed from Ali's team" });
  expect(db.realtimeOutbox.createMany.mock.calls[0][0].data.map(r => r.event)).toEqual(["team:changed", "team:changed"]);
});
const listener = (id, country = "PK") => ({ ...person(id, "LISTENER"), country, role: "LISTENER" });
it("lists users without the role as candidates and excludes ineligible people", async () => {
  const users = [person("a", "ADMIN"), listener("l"), person("b", "BD"), person("j", "JUNIOR_ADMIN"), { ...listener("o"), appRoles: ["OFFICIAL"], isOfficial: true }, person("cs", "CS"), listener("f", "US"), { ...listener("x"), status: "BANNED" }];
  const db = fixture(users, [rule("ADMIN", "BD", null)]);
  const list = await teamCandidates("a", "BD", "", "", db);
  expect(list.map(u => [u.publicId, u.hasRole])).toEqual([["USR-l", false], ["USR-b", true]]);
  await expect(assignTeamMember("a", "USR-o", "BD", db)).rejects.toMatchObject({ code: "TEAM_ROLE_NOT_ALLOWED" });
  await expect(assignTeamMember("a", "USR-cs", "BD", db)).rejects.toMatchObject({ code: "TEAM_ROLE_NOT_ALLOWED" });
});
it("accepting grants the role and records it as team granted", async () => {
  const users = [{ ...person("a", "ADMIN"), name: "Ali" }, listener("l")];
  const db = fixture(users, [rule("ADMIN", "BD", null)]);
  const receipt = await assignTeamMember("a", "USR-l", "BD", db);
  expect(receipt.grantsRole).toBe(true);
  expect(db.notification.upsert.mock.calls[0][0].create.body).toBe("Ali (Admin) wants you to join their team as BD. You will become a BD after accepting.");
  expect((await listTeamInvitations("l", "", db)).incoming[0].grantsRole).toBe(true);
  expect(await respondTeamInvitation("l", receipt.invitationId, "ACCEPT", db)).toMatchObject({ status: "ACCEPTED", grantedRole: true });
  expect(users[1]).toMatchObject({ supervisorUserId: "a", teamRole: "BD", teamGrantedRole: "BD", role: "LISTENER" });
  expect(users[1].appRoles).toEqual(["LISTENER", "BD"]);
  const events = db.realtimeOutbox.createMany.mock.calls.flatMap(c => c[0].data);
  expect(events.find(e => e.event === "user:roles-changed")).toMatchObject({ channel: "user:USR-l", payload: { data: { roles: ["LISTENER", "BD"], management: { role: "BD" } } } });
});
it("removing strips only a team granted role", async () => {
  const users = [{ ...person("a", "ADMIN"), name: "Ali" }, { ...person("g", "BD", "a"), appRoles: ["LISTENER", "BD"], teamGrantedRole: "BD" }, person("p", "BD", "a")];
  const db = fixture(users, []);
  expect(await removeTeamMember("a", "USR-g", db)).toMatchObject({ removed: true, roleRemoved: true, roleKept: false });
  expect(users[1]).toMatchObject({ appRoles: ["LISTENER"], teamGrantedRole: null, supervisorUserId: null });
  expect(db.notification.upsert.mock.calls[0][0].create.body).toBe("You were removed from Ali's team and are no longer a BD");
  expect(await removeTeamMember("a", "USR-p", db)).toMatchObject({ roleRemoved: false, roleKept: false });
  expect(users[2].appRoles).toEqual(["BD"]);
});
it("keeps a team granted role when the BD still has agencies", async () => {
  const users = [person("a", "ADMIN"), { ...person("g", "BD", "a"), appRoles: ["LISTENER", "BD"], teamGrantedRole: "BD" }];
  const db = fixture(users, []); db.agencies = [{ bdUserId: "g" }];
  expect(await removeTeamMember("a", "USR-g", db)).toMatchObject({ removed: true, roleRemoved: false, roleKept: true, reason: "AGENCIES_ASSIGNED" });
  expect(users[1]).toMatchObject({ appRoles: ["LISTENER", "BD"], teamGrantedRole: "BD", supervisorUserId: null });
  expect(db.realtimeOutbox.createMany.mock.calls.flatMap(c => c[0].data).some(e => e.event === "user:roles-changed")).toBe(false);
});
