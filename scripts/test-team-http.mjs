import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { default: sessions } = await import("../src/lib/mobile-session.cjs");
const base = process.env.TEST_PORTAL_URL || "http://localhost:3300";
const prefix = `TEAM-HTTP-${randomUUID()}`;
const users = [];
try {
  for (const [name, role, country] of [["admin", "ADMIN", "PK"], ["bd", "BD", "PK"], ["foreign", "BD", "US"], ["listener", "LISTENER", "PK"]]) {
    users.push(await prisma.user.create({ data: { publicId: `${prefix}-${name}`, name: "Team HTTP fixture", country, appRoles: [role] } }));
  }
  async function request(user, path, method = "GET", body) {
    const response = await fetch(`${base}/api/v1${path}`, { method, headers: { authorization: `Bearer ${sessions.createMobileSession(user).sessionToken}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.headers.get("x-api-version"), "v1"); assert.ok(response.headers.get("x-request-id"));
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await request(users[3], "/team")).status, 403);
  const tree = await request(users[0], "/team"); assert.equal(tree.status, 200); assert.equal(tree.body.data.me.role, "ADMIN");
  const candidates = await request(users[0], `/team/candidates?role=BD&q=${prefix}`);
  assert.deepEqual(candidates.body.data.candidates.map(u => u.publicId), [users[1].publicId]);
  const foreign = await request(users[0], "/team/assign", "POST", { userPublicId: users[2].publicId, role: "BD" });
  assert.equal(foreign.status, 422); assert.equal(foreign.body.error.code, "TEAM_COUNTRY_MISMATCH");
  assert.equal((await request(users[0], "/team/assign", "POST", { userPublicId: users[1].publicId, role: "BD" })).status, 200);
  assert.equal((await request(users[0], "/team")).body.data.members[0].supervisorId, users[0].publicId);
  assert.equal((await request(users[0], `/team/${users[1].publicId}`, "DELETE")).status, 200);
  // The same token must follow database role changes without logout.
  await prisma.user.update({ where: { id: users[0].id }, data: { appRoles: ["LISTENER"] } });
  assert.equal((await request(users[0], "/team")).status, 403);
  console.log("PASS: authenticated HTTP tree, candidates, country validation, assign/remove, live role revalidation and v1 headers.");
} finally {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: users.map(u => u.publicId) } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map(u => u.id) }, publicId: { startsWith: prefix } } });
  await prisma.$disconnect();
}
