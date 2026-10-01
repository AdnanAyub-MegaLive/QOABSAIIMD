import bcrypt from "bcrypt";
import { prisma } from "./prisma.js";
import { hasPermission, validatePermissions } from "./portal-permissions.js";
import { effectiveAdmin, canManageStaff, staffDto } from "./portal-staff-state.js";

const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
export async function saveStaff(identity, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Invalid account data.");
  const action = body.action;
  if (!["create", "update", "reset", "revoke"].includes(action)) fail("Unknown account action.");
  let passwordHash;
  if (action === "create" || action === "reset") {
    if (typeof body.password !== "string" || body.password.length < 12 || Buffer.byteLength(body.password) > 72)
      fail("Use a password of at least 12 characters and no more than 72 bytes.");
    passwordHash = await bcrypt.hash(body.password, 12);
  }
  return prisma.$transaction(async tx => {
    // Serialize account mutations, including changes to a delegating manager.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(104102026)`;
    const actor = await effectiveAdmin(tx, identity.id);
    if (!actor || actor.sessionVersion !== identity.sessionVersion) fail("Your session has changed. Sign in again.", 401);
    const permission = action === "create" ? "accounts.create" : action === "update" ? "accounts.manage" : "accounts.reset";
    if (!hasPermission(actor, permission)) fail("You cannot perform this account action.", 403);
    let target;
    if (action !== "create") {
      if (typeof body.id !== "string") fail("Select an account.");
      target = await tx.admin.findUnique({ where: { id: body.id } });
      if (!await canManageStaff(tx, actor, target)) fail("You can only manage subordinate accounts. Your own account and platform managers are protected.", 403);
      if (body.sessionVersion !== target.sessionVersion) fail("This account changed. Reload before saving.", 409);
    }
    let data;
    if (["create", "update"].includes(action)) {
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      if (name.length < 2 || name.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid name and email address.");
      if (!["STAFF", "MANAGER"].includes(body.role)) fail("Select Staff or Manager.");
      if (typeof body.active !== "boolean") fail("Select an account status.");
      const permissions = validatePermissions(body.permissions, actor);
      if (body.role === "STAFF" && permissions.some(p => p.startsWith("accounts.") && p !== "accounts.view"))
        fail("Choose Manager to delegate staff administration permissions.");
      data = { name, email, role: body.role, active: body.active, permissions };
    }
    const result = action === "create"
      ? await tx.admin.create({ data: { ...data, passwordHash, createdById: actor.id } })
      : await tx.admin.update({ where: { id: target.id }, data: { ...(data ?? {}), ...(passwordHash ? { passwordHash } : {}), sessionVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { adminId: actor.id, action: `STAFF_${action.toUpperCase()}`, category: "ACCESS_MANAGEMENT", entityType: "Admin", entityId: result.id,
      description: `${actor.name} performed ${action} on staff account ${result.email}.`,
      metadata: { before: target ? staffDto(target) : null, after: staffDto(result) } } });
    return staffDto(result);
  }, { timeout: 15000 });
}
