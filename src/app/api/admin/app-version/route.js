import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { appVersionSettingsDto, clearAppVersionCache, validateAppVersionInput } from "@/lib/app-version";

export const runtime = "nodejs";
function failure(error) {
  if (!error.status) console.error("App version settings failed", error);
  return Response.json({ success: false, error: { code: error.status === 409 ? "SETTINGS_CONFLICT" : error.code || "SETTINGS_FAILED", message: error.status ? error.message : "Unable to save app version settings.", ...(error.fields ? { fields: error.fields } : {}) } }, { status: error.status || 500 });
}
export async function GET() {
  try {
    await requirePermission("uploads.view");
    return Response.json({ success: true, data: appVersionSettingsDto(await prisma.appVersionSettings.findUnique({ where: { id: "GLOBAL" } })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PUT(request) {
  try {
    const admin = await requirePermission("uploads.edit"); sameOrigin(request);
    const input = await jsonBody(request);
    const { errors, values } = validateAppVersionInput(input);
    if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { status: 422, code: "VALIDATION_ERROR", fields: errors });
    const data = await prisma.$transaction(async tx => {
      await tx.appVersionSettings.upsert({ where: { id: "GLOBAL" }, create: { id: "GLOBAL" }, update: {} });
      const result = await tx.appVersionSettings.updateMany({ where: { id: "GLOBAL", revision: input.revision }, data: { ...values, revision: { increment: 1 } } });
      if (!result.count) throw Object.assign(new Error("Settings changed. Reload before saving."), { status: 409 });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "APP_FORCE_UPDATE_UPDATED", category: "SETTINGS", description: `Updated Android force update: ${values.forceUpdateEnabled ? "enabled" : "disabled"}, minimum version code ${values.androidMinVersionCode}.`, metadata: values } });
      return { ...values, revision: input.revision + 1 };
    });
    clearAppVersionCache();
    return Response.json({ success: true, data });
  } catch (error) { return failure(error); }
}
