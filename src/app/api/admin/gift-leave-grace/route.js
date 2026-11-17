import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { invalidateGiftLeaveGraceSettings } from "@/lib/gift-leave-grace";

const fail = (e) => Response.json({ success: false, error: { message: e.status ? e.message : "Unable to manage this setting." } }, { status: e.status ?? 500 });

const snapshot = (row) => ({ enabled: row?.enabled === true, updatedAt: row?.updatedAt?.toISOString() ?? null });

export async function GET() {
  try {
    await requirePermission("rules.view");
    return Response.json({ success: true, data: snapshot(await prisma.giftLeaveGraceSettings.findUnique({ where: { id: "DEFAULT" } })) });
  } catch (e) { return fail(e); }
}

export async function PUT(request) {
  try {
    const admin = await requirePermission("rules.edit");
    sameOrigin(request);
    const body = await jsonBody(request);
    if (typeof body?.enabled !== "boolean") throw Object.assign(new Error("enabled must be true or false."), { status: 422 });
    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.giftLeaveGraceSettings.upsert({ where: { id: "DEFAULT" }, create: { id: "DEFAULT", enabled: body.enabled, updatedByAdminId: admin.id }, update: { enabled: body.enabled, updatedByAdminId: admin.id } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "GIFT_LEAVE_GRACE_UPDATED", category: "FINANCE", entityType: "GiftLeaveGraceSettings", entityId: "DEFAULT",
        description: `Finish gifts after leaving room ${body.enabled ? "enabled" : "disabled"}.`, metadata: { enabled: body.enabled } } });
      return saved;
    });
    invalidateGiftLeaveGraceSettings();
    return Response.json({ success: true, data: snapshot(row) });
  } catch (e) { return fail(e); }
}
