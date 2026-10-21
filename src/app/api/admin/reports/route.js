import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = error => json({ success: false, error: { message: error.status ? error.message : "Unable to process reports." } }, error.status || 500);
export async function GET(request) {
  try {
    await requirePermission("content.view");
    const params = new URL(request.url).searchParams, status = params.get("status") || "OPEN", cursor = params.get("cursor");
    if (!["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].includes(status)) return json({ error: { message: "Invalid status." } }, 422);
    const rows = await prisma.safetyReport.findMany({ where: { status }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return json({ success: true, data: { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null } });
  } catch (error) { return fail(error); }
}
export async function PATCH(request) {
  try {
    const admin = await requirePermission("content.manage"), body = await request.json();
    if (typeof body.reportId !== "string" || !["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].includes(body.status) || typeof body.reviewNote !== "string" || body.reviewNote.length > 1000) return json({ error: { message: "Provide report ID, status and a review note up to 1,000 characters." } }, 422);
    await prisma.$transaction(async tx => {
      await tx.safetyReport.update({ where: { publicId: body.reportId }, data: { status: body.status, reviewNote: body.reviewNote, reviewedAt: new Date(), reviewedById: admin.id } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "SAFETY_REPORT_REVIEWED", category: "CONTENT_MANAGEMENT", entityType: "SafetyReport", entityId: body.reportId, description: "Updated safety report review", metadata: { status: body.status, reviewNote: body.reviewNote } } });
    });
    return json({ success: true });
  } catch (error) { return fail(error); }
}
