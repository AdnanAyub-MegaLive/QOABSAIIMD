import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { lockReporter, reportError } from "@/lib/safety-reports";
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = error => json({ success: false, error: { message: error.status ? error.message : "Unable to process reports." } }, error.status || 500);
export async function GET(request) {
  try {
    await requirePermission("content.view");
    const params = new URL(request.url).searchParams, status = params.get("status") || "OPEN", cursor = params.get("cursor");
    if (!["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].includes(status)) return json({ error: { message: "Invalid status." } }, 422);
    const rows = await prisma.safetyReport.findMany({ where: { status }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const users = await prisma.user.findMany({where:{id:{in:[...new Set(rows.flatMap(r=>[r.reporterUserId,...(r.targetType==="USER"?[r.targetInternalId]:[])]))]}},select:{id:true,publicId:true,name:true}});
    const byId=new Map(users.map(u=>[u.id,{publicId:u.publicId,name:u.name}]));
    return json({ success: true, data: { items: rows.slice(0, 50).map(r=>({...r,reporter:byId.get(r.reporterUserId)??null,targetUser:byId.get(r.targetInternalId)??null})), nextCursor: rows.length > 50 ? rows[49].id : null } });
  } catch (error) { return fail(error); }
}
export async function PATCH(request) {
  try {
    const admin = await requirePermission("content.manage"), body = await request.json();
    if (typeof body.reportId !== "string" || !["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].includes(body.status) || typeof body.reviewNote !== "string" || body.reviewNote.length > 1000) return json({ error: { message: "Provide report ID, status and a review note up to 1,000 characters." } }, 422);
    await prisma.$transaction(async tx => {
      const report=await tx.safetyReport.findUnique({where:{publicId:body.reportId}});
      if(!report)throw reportError("TARGET_NOT_FOUND","Report not found.",404);
      await lockReporter(tx,report.reporterUserId);
      if(["OPEN","REVIEWING"].includes(body.status)&&await tx.safetyReport.findFirst({where:{id:{not:report.id},reporterUserId:report.reporterUserId,targetType:report.targetType,targetInternalId:report.targetInternalId,status:{in:["OPEN","REVIEWING"]}}}))throw reportError("DUPLICATE_REPORT","Another open report already exists for this reporter and target.",409);
      await tx.safetyReport.update({ where: { publicId: body.reportId }, data: { status: body.status, reviewNote: body.reviewNote, reviewedAt: new Date(), reviewedById: admin.id } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "SAFETY_REPORT_REVIEWED", category: "CONTENT_MANAGEMENT", entityType: "SafetyReport", entityId: body.reportId, description: "Updated safety report review", metadata: { status: body.status, reviewNote: body.reviewNote } } });
    }, {isolationLevel:"ReadCommitted"});
    return json({ success: true });
  } catch (error) { return fail(error); }
}
