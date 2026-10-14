import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { welcomeDefaults } from "@/lib/action-notifications";
function failure(error) {
  return Response.json({ success: false, error: { code: error.status === 409 ? "SETTINGS_CONFLICT" : error.code || "SETTINGS_FAILED", message: error.status ? error.message : "Unable to save notification settings." } }, { status: error.status || 500 });
}
export async function GET() {
  try {
    await requirePermission("notifications.view");
    return Response.json({ success: true, data: await prisma.notificationSettings.findUnique({ where: { id: "GLOBAL" } }) ?? welcomeDefaults }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PUT(request) {
  try {
    const admin = await requirePermission("notifications.manage"); sameOrigin(request);
    const input = await jsonBody(request);
    const title = typeof input.welcomeTitle === "string" ? input.welcomeTitle.trim() : "";
    const body = typeof input.welcomeBody === "string" ? input.welcomeBody.trim() : "";
    if (typeof input.welcomeEnabled !== "boolean" || !title || title.length > 120 || !body || body.length > 2000 || !Number.isInteger(input.revision) || input.revision < 0) throw Object.assign(new Error("Provide a title (1–120 characters), message (1–2000 characters) and valid revision."), { status: 422, code: "VALIDATION_ERROR" });
    const data = await prisma.$transaction(async tx => {
      await tx.notificationSettings.upsert({ where: { id: "GLOBAL" }, create: { id: "GLOBAL" }, update: {} });
      const result = await tx.notificationSettings.updateMany({ where: { id: "GLOBAL", revision: input.revision }, data: { welcomeEnabled: input.welcomeEnabled, welcomeTitle: title, welcomeBody: body, revision: { increment: 1 } } });
      if (!result.count) throw Object.assign(new Error("Settings changed. Reload before saving."), { status: 409 });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "WELCOME_NOTIFICATION_UPDATED", category: "NOTIFICATIONS", description: "Updated first-time welcome notification." } });
      return { welcomeEnabled: input.welcomeEnabled, welcomeTitle: title, welcomeBody: body, revision: input.revision + 1 };
    });
    return Response.json({ success: true, data });
  } catch (error) { return failure(error); }
}
