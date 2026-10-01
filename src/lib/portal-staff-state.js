import { allPermissions } from "./portal-permissions.js";

// Descendants can never retain authority withdrawn from their creating manager.
export async function effectiveAdmin(db, id) {
  let current = await db.admin.findUnique({ where: { id } });
  if (!current?.active) return null;
  const admin = current;
  let permissions = current.role === "SUPER_ADMIN" ? allPermissions : current.permissions;
  const seen = new Set([id]);
  while (current.createdById) {
    if (seen.has(current.createdById) || seen.size > 32) return null;
    seen.add(current.createdById);
    current = await db.admin.findUnique({ where: { id: current.createdById } });
    if (!current?.active) return null;
    if (current.role !== "SUPER_ADMIN") permissions = permissions.filter(p => current.permissions.includes(p));
  }
  return { ...admin, permissions };
}

export async function canManageStaff(db, actor, target) {
  if (!target || actor.id === target.id || target.role === "SUPER_ADMIN") return false;
  if (actor.role === "SUPER_ADMIN") return true;
  let current = target;
  const seen = new Set();
  while (current?.createdById && !seen.has(current.id) && seen.size < 32) {
    if (current.createdById === actor.id) return true;
    seen.add(current.id);
    current = await db.admin.findUnique({ where: { id: current.createdById } });
  }
  return false;
}

export function staffDto(admin) {
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: admin.active,
    permissions: admin.permissions, createdById: admin.createdById, sessionVersion: admin.sessionVersion,
    createdAt: admin.createdAt, lastLoginAt: admin.lastLoginAt };
}
