import { auth } from "../../auth";
import { prisma } from "./prisma";
import { effectiveAdmin, staffDto } from "./portal-staff-state.js";
import { hasPermission } from "./portal-permissions.js";
import { redirect } from "next/navigation";

export async function requirePortalAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const admin = await effectiveAdmin(prisma, session.user.id);
  if (!admin || admin.sessionVersion !== session.user.sessionVersion) return null;
  return staffDto(admin);
}

export async function requireFinanceAdmin() {
  const admin = await requirePortalAdmin();
  return admin && hasPermission(admin, "finance.view")
    ? admin
    : null;
}

export async function requirePermission(permission) {
  const admin = await requirePortalAdmin();
  if (!admin) throw Object.assign(new Error("Please sign in to the portal."), { status: 401, code: "UNAUTHORIZED" });
  if (!hasPermission(admin, permission)) throw Object.assign(new Error("You do not have permission for this action."), { status: 403, code: "FORBIDDEN" });
  return admin;
}
export async function requirePagePermission(permission) {
  const admin = await requirePortalAdmin();
  if (!admin) redirect("/");
  if (!hasPermission(admin, permission)) redirect("/access-denied");
  return admin;
}
export async function portalPermissionError(permission) {
  try { await requirePermission(permission); return null; }
  catch (error) {
    if (!error.status) throw error;
    return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }
}
