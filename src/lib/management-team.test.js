import { expect, it, vi } from "vitest";
vi.mock("./user-perks.js", () => ({ resolveUserPerks: async () => new Map() }));
import { assignTeamMember, removeTeamMember, readTeam, teamCandidates, countRole } from "./management-team.js";
import { managementIdentity } from "./user-roles.js";

const person = (id, role, supervisorUserId = null, country = "PK") => ({ id, publicId: `USR-${id}`, name: id, appRoles: [role], country, status: "ACTIVE", deletedAt: null, supervisorUserId, teamRole: supervisorUserId ? role : null });
function fixture(users, rules, policy = { limitScope: "DIRECT", allowAncestorRemoval: false }) {
  const db = {
    user: {
      findUnique: async ({ where }) => users.find(u => where.id ? u.id === where.id : u.publicId === where.publicId),
      findMany: vi.fn(async ({ where }) => users.filter(u => where.supervisorUserId?.in ? where.supervisorUserId.in.includes(u.supervisorUserId) : u.supervisorUserId === null && u.country === where.country && u.appRoles.includes(where.appRoles.has) && u.status === "ACTIVE" && !u.deletedAt && u.id !== where.id.not && (!where.OR || u.publicId.toLowerCase().includes(where.OR[0].publicId.contains.toLowerCase()) || u.name.toLowerCase().includes(where.OR[1].name.contains.toLowerCase())))),
      updateMany: async ({ where, data }) => { const u = users.find(u => u.id === where.id && u.supervisorUserId === null); if (!u) return { count: 0 }; Object.assign(u, data); return { count: 1 }; },
      update: async ({ where, data }) => Object.assign(users.find(u => u.id === where.id), data),
    },
    roleTeamLimit: { findUnique: async ({ where }) => rules.find(r => r.supervisorRole === where.supervisorRole_memberRole.supervisorRole && r.memberRole === where.supervisorRole_memberRole.memberRole), findMany: async ({ where }) => rules.filter(r => r.supervisorRole === where.supervisorRole) },
    teamPolicy: { findUnique: async () => policy }, auditLog: { create: vi.fn() },
  };
  db.$transaction = vi.fn(work => work(db)); return db;
}
const rule = (supervisorRole, memberRole, max) => ({ supervisorRole, memberRole, max });
it("uses database quotas, audits assignment and rejects taken members", async () => {
  const users = [person("a", "ADMIN"), person("b", "BD"), person("c", "BD")];
  const db = fixture(users, [rule("ADMIN", "BD", 1)]);
  expect(await assignTeamMember("a", "USR-b", "BD", db)).toMatchObject({ supervisorId: "USR-a" });
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
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
  const db = fixture([person("j", "JUNIOR_ADMIN"), person("a", "ADMIN", "j"), person("b", "BD", "a"), person("c", "BD"), person("foreign", "BD", null, "US")], [rule("JUNIOR_ADMIN", "BD", 4)]);
  const team = await readTeam("j", "https://portal.test", db);
  expect(team.members).toHaveLength(2); expect(team.members[1]).toMatchObject({ supervisorId: "USR-a", frameUrl: null });
  expect(team.limits[0].used).toBe(0);
  expect((await teamCandidates("j", "BD", "", "https://portal.test", db)).map(u => u.publicId)).toEqual(["USR-c"]);
  await expect(teamCandidates("j", "INVALID", "", "", db)).rejects.toMatchObject({ code: "TEAM_ROLE_NOT_ALLOWED" });
});
it("advertises management roles without granting portal administrator access", () => {
  expect(managementIdentity(person("m", "MANAGER")).management.enabled).toBe(true);
  expect(managementIdentity(person("b", "BD")).management.enabled).toBe(false);
});
