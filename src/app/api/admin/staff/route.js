import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { permissionGroups, permissionTemplates } from "@/lib/portal-permissions";
import { canManageStaff, staffDto } from "@/lib/portal-staff-state";
import { saveStaff } from "@/lib/portal-staff";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";

function failure(error) {
  const status = error.code === "P2002" ? 409 : error.status || 500;
  if (status === 500) console.error("Staff management failed", error);
  return Response.json({ success: false, error: { code: status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : status === 409 ? "CONFLICT" : "VALIDATION_ERROR",
    message: error.code === "P2002" ? "This email is already in use." : status === 500 ? "Unable to update staff accounts." : error.message } }, { status });
}
export async function GET() {
  try {
    const actor = await requirePermission("accounts.view");
    const rows = await prisma.admin.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    const accounts = [];
    for (const row of rows) {
      const editable = await canManageStaff(prisma, actor, row);
      if (actor.role === "SUPER_ADMIN" || editable || row.id === actor.id) accounts.push({ ...staffDto(row), editable });
    }
    const logs = await prisma.auditLog.findMany({ where: { category: "ACCESS_MANAGEMENT", entityId: { in: accounts.map(a => a.id) } },
      select: { id: true, action: true, description: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 });
    return Response.json({ success: true, data: { actor, accounts, logs, groups: permissionGroups, templates: permissionTemplates } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    sameOrigin(request);
    const actor = await requirePermission("accounts.view");
    return Response.json({ success: true, data: await saveStaff(actor, await jsonBody(request)) });
  } catch (error) { return failure(error); }
}
