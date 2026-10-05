// Local integration test with disposable users, staff, applications, and agencies.
import { config } from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import sessions from "../src/lib/mobile-session.cjs";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const origin = "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname), "Use a local development database.");
const suffix = randomUUID().slice(0, 8);
const users = [], admins = [];
async function user(role = "LISTENER") {
  const record = await prisma.user.create({ data: { publicId: `TEST-BD-${suffix}-${users.length}`, name: `BD test ${users.length}`, appRoles: [role], status: "ACTIVE" } });
  users.push(record);
  return record;
}
async function mobile(who, path, method = "GET", body) {
  const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${sessions.createMobileSessionToken(who)}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, ...(await response.json()) };
}
async function staff(permissions) {
  const password = randomUUID();
  const record = await prisma.admin.create({ data: { name: "Agency test manager", email: `bd-${suffix}-${admins.length}@example.invalid`, passwordHash: await bcrypt.hash(password, 10), role: "MANAGER", permissions } });
  admins.push(record);
  const cookies = new Map();
  async function request(path, options = {}) {
    const response = await fetch(origin + path, { ...options, redirect: "manual", headers: { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), Origin: origin, ...options.headers } });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const i = pair.indexOf("="); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
    return response;
  }
  const csrf = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: record.email, password }) });
  return request;
}
try {
  const bd = await user("BD"), otherBD = await user("BD"), applicant = await user(), directOwner = await user(), managerOwner = await user();
  let result = await mobile(applicant, "/api/v1/agencies/apply", "POST", { agencyName: "Application agency", whatsapp: "+923001234567", bdCode: bd.publicId });
  assert.equal(result.status, 201, JSON.stringify(result));
  const applicationId = result.data.applicationId;
  result = await mobile(bd, "/api/v1/bd/applications");
  assert.ok(result.data.applications.some(a => a.publicId === applicationId));
  result = await mobile(otherBD, "/api/v1/bd/applications");
  assert.ok(!result.data.applications.some(a => a.publicId === applicationId));
  result = await mobile(otherBD, `/api/v1/bd/applications/${applicationId}`, "PATCH", { decision: "APPROVED" });
  assert.equal(result.status, 404);
  result = await mobile(applicant, "/api/v1/bd/agencies", "POST", { agencyName: "Forbidden", ownerPublicId: directOwner.publicId });
  assert.equal(result.status, 403);
  result = await mobile(bd, `/api/v1/bd/applications/${applicationId}`, "PATCH", { decision: "APPROVED" });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal((await prisma.agency.findUnique({ where: { ownerUserId: applicant.id } })).bdUserId, bd.id);
  result = await mobile(bd, `/api/v1/bd/applications/${applicationId}`, "PATCH", { decision: "APPROVED" });
  assert.equal(result.status, 409);
  result = await mobile(bd, "/api/v1/bd/agencies", "POST", { agencyName: "Direct agency", ownerPublicId: directOwner.publicId, bdCode: otherBD.publicId });
  assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal((await prisma.agency.findUnique({ where: { ownerUserId: directOwner.id } })).bdUserId, bd.id);
  result = await mobile(bd, "/api/v1/bd/agencies", "POST", { agencyName: "Duplicate", ownerPublicId: directOwner.publicId });
  assert.equal(result.status, 409);
  const rejectedOwner = await user();
  result = await mobile(rejectedOwner, "/api/v1/agencies/apply", "POST", { agencyName: "Reject test", whatsapp: "12345", bdCode: bd.publicId });
  const rejectedId = result.data.applicationId;
  result = await mobile(bd, `/api/v1/bd/applications/${rejectedId}`, "PATCH", { decision: "REJECTED" });
  assert.equal(result.status, 422);
  result = await mobile(bd, `/api/v1/bd/applications/${rejectedId}`, "PATCH", { decision: "REJECTED", note: "Test rejection" });
  assert.equal(result.status, 200);
  await prisma.user.update({ where: { id: bd.id }, data: { appRoles: ["LISTENER"] } });
  result = await mobile(bd, "/api/v1/bd/agencies");
  assert.equal(result.status, 403);
  result = await mobile(rejectedOwner, "/api/v1/agencies/apply", "POST", { agencyName: "Invalid BD", whatsapp: "12345", bdCode: bd.publicId });
  assert.equal(result.status, 422);
  const manager = await staff(["agencies.view", "agencies.manage"]);
  const body = JSON.stringify({ agencyName: "Manager agency", ownerPublicId: managerOwner.publicId, bdCode: otherBD.publicId });
  const created = await manager("/api/admin/agencies", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.equal(created.status, 201, await created.text());
  const readOnly = await staff(["agencies.view"]);
  assert.equal((await readOnly("/api/admin/agencies", { method: "POST", headers: { "Content-Type": "application/json" }, body })).status, 403);
  console.log("PASS: BD application scoping, approval, rejection, direct grants, duplicate protection, role revocation, and manager permissions.");
} finally {
  const ids = users.map(u => u.id);
  const applications = await prisma.agencyApplication.findMany({ where: { userId: { in: ids } }, select: { publicId: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: applications.map(a => a.publicId) } }, { adminId: { in: admins.map(a => a.id) } }] } });
  await prisma.agencyApplication.deleteMany({ where: { userId: { in: ids } } });
  await prisma.agency.deleteMany({ where: { ownerUserId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.admin.deleteMany({ where: { id: { in: admins.map(a => a.id) } } });
  await prisma.$disconnect();
}
