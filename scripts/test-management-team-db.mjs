import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { assignTeamMember, removeTeamMember } = await import("../src/lib/management-team.js");
const prefix = `TEAM-TEST-${randomUUID()}`, ids = [], publicIds = [];
try {
  // Roll back fixtures and policy changes together; no production data is retained or deleted.
  await prisma.$transaction(async tx => {
    for (const [name, role] of [["supervisor", "ADMIN"], ["member", "BD"], ["second", "BD"]]) {
      const user = await tx.user.create({ data: { publicId: `${prefix}-${name}`, name: "Management integration fixture", country: "PK", appRoles: [role] } });
      ids.push(user.id); publicIds.push(user.publicId);
    }
    await tx.roleTeamLimit.upsert({ where: { supervisorRole_memberRole: { supervisorRole: "ADMIN", memberRole: "BD" } }, create: { supervisorRole: "ADMIN", memberRole: "BD", max: 1 }, update: { max: 1 } });
    const db = { $transaction: work => work(tx) };
    await assignTeamMember(ids[0], publicIds[1], "BD", db);
    await assert.rejects(assignTeamMember(ids[0], publicIds[2], "BD", db), e => e.code === "TEAM_LIMIT_REACHED");
    assert.equal((await tx.user.findUnique({ where: { id: ids[1] } })).supervisorUserId, ids[0]);
    await removeTeamMember(ids[0], publicIds[1], db);
    assert.equal((await tx.user.findUnique({ where: { id: ids[1] } })).supervisorUserId, null);
    assert.equal(await tx.auditLog.count({ where: { entityId: { in: publicIds } } }), 2);
    throw new Error("FIXTURE_ROLLBACK_SUCCESS");
  }, { isolationLevel: "Serializable", timeout: 15000 });
} catch (error) {
  if (error.message !== "FIXTURE_ROLLBACK_SUCCESS") throw error;
  console.log("PASS: PostgreSQL assignment, quota, removal and audit; fixtures rolled back.");
} finally { await prisma.$disconnect(); }
