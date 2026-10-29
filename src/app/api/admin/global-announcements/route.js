import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { announcementDefaults, validateAnnouncementPolicy } from "@/lib/global-announcement-policy";

const reply = data => Response.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
function failure(e) {
  const conflict = ["P2002", "P2034"].includes(e.code);
  return Response.json({ success: false, error: { code: conflict ? "SETTINGS_CHANGED" : e.status ? e.code ?? "VALIDATION_ERROR" : "ANNOUNCEMENT_SETTINGS_FAILED",
    message: conflict ? "Settings changed. Reload before saving." : e.status ? e.message : "Unable to save announcement settings." } }, { status: conflict ? 409 : e.status ?? 500 });
}
export async function GET() {
  try {
    await requirePermission("rules.view");
    return reply(await prisma.globalAnnouncementPolicy.findUnique({ where: { id: "GLOBAL" } }) ?? { ...announcementDefaults, revision: 0 });
  } catch (e) { return failure(e); }
}
export async function PUT(request) {
  try {
    const admin = await requirePermission("rules.manage");
    sameOrigin(request);
    const body = await jsonBody(request), values = validateAnnouncementPolicy(body);
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw Object.assign(new Error("Invalid settings revision."), { status: 422, code: "VALIDATION_ERROR" });
    const result = await prisma.$transaction(async tx => {
      if (body.revision === 0) await tx.globalAnnouncementPolicy.create({ data: { id: "GLOBAL", ...values } });
      else {
        const update = await tx.globalAnnouncementPolicy.updateMany({ where: { id: "GLOBAL", revision: body.revision }, data: { ...values, revision: { increment: 1 } } });
        if (!update.count) throw Object.assign(new Error("Settings changed. Reload before saving."), { status: 409, code: "SETTINGS_CHANGED" });
      }
      await tx.auditLog.create({ data: { adminId: admin.id, action: "GLOBAL_ANNOUNCEMENTS_UPDATED", category: "FINANCE",
        entityType: "GlobalAnnouncementPolicy", entityId: "GLOBAL", description: "Updated future global announcement thresholds.", metadata: values } });
      return tx.globalAnnouncementPolicy.findUnique({ where: { id: "GLOBAL" } });
    });
    return reply(result);
  } catch (e) { return failure(e); }
}
