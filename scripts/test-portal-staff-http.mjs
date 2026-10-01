// Local-only authorization test. Creates isolated staff fixtures; no mobile wallets are touched.
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const origin = process.env.STAFF_TEST_ORIGIN || "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Only local test servers are allowed.");
const suffix = randomUUID().replaceAll("-", "");
const password = `Test-${randomUUID()}`;
const fixtures = [];
function client() {
  const jar = new Map();
  return async (path, options = {}) => {
    const res = await fetch(origin + path, { ...options, redirect: "manual", headers: { Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join("; "), Origin: new URL(process.env.AUTH_URL || origin).origin, ...options.headers } });
    for (const cookie of res.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const i = pair.indexOf("="); jar.set(pair.slice(0,i), pair.slice(i+1)); }
    return res;
  };
}
async function login(email, suppliedPassword = password) {
  const request = client();
  const csrf = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password: suppliedPassword, callbackUrl: `${origin}/portal` }) });
  return request;
}
async function mutation(request, body, status = 200) {
  const res = await request("/api/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  assert.equal(res.status, status, JSON.stringify(json));
  if (status === 200 && body.action === "create") fixtures.push(json.data.id);
  return json.data;
}
try {
  const root = await prisma.admin.create({ data: { name: "RBAC test root", email: `rbac-root-${suffix}@example.invalid`, passwordHash: await bcrypt.hash(password, 12), role: "SUPER_ADMIN" } });
  fixtures.push(root.id);
  const rootRequest = await login(root.email);
  assert.equal((await rootRequest("/api/admin/staff")).status, 200);
  assert.equal((await client()("/api/admin/staff")).status, 401);
  const common = { name: "RBAC test staff", password, role: "STAFF", active: true };
  const manager = await mutation(rootRequest, { ...common, action: "create", email: `rbac-manager-${suffix}@example.invalid`, role: "MANAGER", permissions: ["accounts.view", "accounts.create", "accounts.manage", "accounts.reset", "roomGames.view", "roomGames.manage"] });
  const managerRequest = await login(manager.email);
  await mutation(managerRequest, { ...common, action: "create", email: `rbac-overgrant-${suffix}@example.invalid`, permissions: ["finance.view"] }, 403);
  await mutation(managerRequest, { ...common, action: "update", id: root.id, sessionVersion: 0, email: root.email, permissions: [] }, 403);
  await mutation(managerRequest, { ...manager, action: "update", permissions: [] }, 403);
  const staff = await mutation(managerRequest, { ...common, action: "create", email: `rbac-staff-${suffix}@example.invalid`, permissions: ["roomGames.view"] });
  let staffRequest = await login(staff.email);
  assert.equal((await staffRequest("/api/admin/room-games")).status, 200);
  assert.equal((await staffRequest("/api/admin/staff")).status, 403);
  assert.equal((await staffRequest("/api/admin/wallet/reconciliation")).status, 403);
  assert.equal((await staffRequest("/api/admin/room-games", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 403);
  assert.equal((await staffRequest("/users")).headers.get("location"), "/access-denied");
  assert.equal((await (await staffRequest("/api/admin/access")).json()).data.permissions.includes("roomGames.manage"), false);
  await mutation(managerRequest, { action: "revoke", id: staff.id, sessionVersion: staff.sessionVersion });
  assert.equal((await staffRequest("/api/admin/room-games")).status, 401);
  staffRequest = await login(staff.email);
  assert.equal((await staffRequest("/api/admin/room-games")).status, 200);
  const updatedManager = await mutation(rootRequest, { ...manager, action: "update", permissions: ["accounts.view", "accounts.create", "accounts.manage", "accounts.reset"] });
  assert.equal((await staffRequest("/api/admin/room-games")).status, 403);
  assert.equal((await managerRequest("/api/admin/staff")).status, 401);
  await mutation(rootRequest, { ...updatedManager, action: "update", active: false });
  assert.equal((await staffRequest("/api/admin/access")).status, 401);
  const suspendedLogin = await login(manager.email);
  assert.equal((await suspendedLogin("/api/admin/access")).status, 401);
  assert.ok(await prisma.auditLog.count({ where: { entityId: { in: fixtures }, category: "ACCESS_MANAGEMENT" } }) >= 5);
  console.log("PASS: staff login, view-only APIs, page denial, over-grant prevention, protected accounts, revocation, inherited restriction, suspended ancestry and audit records.");
} finally {
  await prisma.auditLog.deleteMany({ where: { category: "ACCESS_MANAGEMENT", entityId: { in: fixtures } } });
  for (const id of [...fixtures].reverse()) await prisma.admin.delete({ where: { id } });
  await prisma.$disconnect();
}
