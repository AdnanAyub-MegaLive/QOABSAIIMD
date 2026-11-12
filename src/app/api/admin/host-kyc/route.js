import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin } from "@/lib/game-control/http";
import { reviewKyc } from "@/lib/host-kyc";
import { emitToUser } from "@/lib/realtime";
const failure = e => Response.json({ success: false, error: { message: e.status ? e.message : "Unable to process verification." } }, { status: e.status || 500 });
export async function GET() {
  try {
    await requirePermission("hosts.manage");
    const rows = await prisma.talentVerification.findMany({ where: { status: "PENDING" }, orderBy: { submittedAt: "asc" }, take: 100, include: { user: { select: { publicId: true, name: true } }, talent: { select: { publicId: true, displayName: true } } } });
    return Response.json({ success: true, data: { submissions: rows.map(r => ({ id: r.id, user: r.user || { publicId: r.talent?.publicId, name: r.talent?.displayName }, status: r.status, legalName: r.supportingFiles?.legalName || null, idType: r.supportingFiles?.idType || null, submittedAt: r.submittedAt, images: Object.fromEntries(["identityCardFront", "identityCardBack", "profileImage"].map(f => [f, r[f]?.startsWith("kyc:") ? `/api/admin/host-kyc/${r.id}/media?field=${f}` : null])) })) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return failure(e); }
}
export async function PATCH(request) {
  try {
    const admin = await requirePermission("hosts.manage"); sameOrigin(request);
    const body = await request.json(), result = await reviewKyc(prisma, admin, String(body.id || ""), body.action, body.rejectionReason);
    if (result.publicId) await emitToUser(result.publicId, "kyc:changed", { status: result.status, rejectionReason: result.rejectionReason });
    return Response.json({ success: true, data: result });
  } catch (e) { return failure(e); }
}
