import bcrypt from "bcrypt";
import { prisma } from "./prisma.js";
import { hasPermission, validatePermissions, assignedPermissions } from "./portal-permissions.js";
import { normalizeCountries } from "./staff-scope.js";
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
    const permission = action === "create" ? "accounts.create" : action === "update" ? "accounts.edit" : "accounts.reset";
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
      const requested = assignedPermissions(Array.isArray(body.permissions)?body.permissions:[]).sort();
      const previous = assignedPermissions(target?.permissions??[]).sort();
      const accessChanged = JSON.stringify(requested)!==JSON.stringify(previous) || (target && target.role!==body.role);
      if(accessChanged && !hasPermission(actor,'accounts.permissions')) fail('Assign permissions access is required to change grants or role.',403);
      const permissions = accessChanged || action==='create' ? validatePermissions(body.permissions,actor) : target.permissions;
      const allowedCountries = normalizeCountries(body.allowedCountries ?? target?.allowedCountries ?? []);
      const maxGrantDays = body.maxGrantDays == null || body.maxGrantDays === "" ? null : Number(body.maxGrantDays);
      if (maxGrantDays != null && (!Number.isInteger(maxGrantDays) || maxGrantDays < 1 || maxGrantDays > 3650)) fail("Enter a grant limit between 1 and 3650 days, or leave it empty.");
      const linkedUserPublicId = String(body.linkedUserPublicId ?? "").trim() || null;
      if (linkedUserPublicId && !await tx.user.findUnique({ where: { publicId: linkedUserPublicId }, select: { id: true } })) fail("The linked app account was not found.");
      const limitsChanged = JSON.stringify(allowedCountries) !== JSON.stringify([...(target?.allowedCountries ?? [])].sort()) || maxGrantDays !== (target?.maxGrantDays ?? null);
      if (limitsChanged && !hasPermission(actor, "accounts.permissions")) fail("Assign permissions access is required to change regions or grant limits.", 403);
      // A region-limited manager cannot create wider access than their own.
      if (actor.role !== "SUPER_ADMIN" && actor.allowedCountries?.length && (!allowedCountries.length || allowedCountries.some(c => !actor.allowedCountries.includes(c)))) fail("You can only assign your own countries.", 403);
      if (actor.role !== "SUPER_ADMIN" && actor.maxGrantDays && (!maxGrantDays || maxGrantDays > actor.maxGrantDays)) fail(`Set a grant limit of ${actor.maxGrantDays} days or less.`, 403);
      data = { name, email, role: body.role, active: body.active, permissions, allowedCountries, maxGrantDays, linkedUserPublicId };
      // A direct Platform Admin grant must not be silently reduced by an old
      // delegating manager. Transfer administration to the granting root.
      if (actor.role === "SUPER_ADMIN" && action === "update") data.createdById = actor.id;
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
