import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
export async function GET(request, { params }) {
  try {
    const admin = await requirePermission("hosts.manage"), { id } = await params, field = new URL(request.url).searchParams.get("field");
    if (!["identityCardFront", "identityCardBack", "profileImage"].includes(field)) return new Response(null, { status: 404 });
    const row = await prisma.talentVerification.findUnique({ where: { id } });
    if (!row?.[field]?.startsWith("kyc:")) return new Response(null, { status: 404 });
    const image = await prisma.kycImage.findUnique({ where: { id: row[field].slice(4) } });
    if (!image) return new Response(null, { status: 404 });
    await prisma.auditLog.create({ data: { adminId: admin.id, action: "KYC_DOCUMENT_VIEWED", category: "USER_MANAGEMENT", entityType: "TalentVerification", entityId: id, description: "Viewed private verification document.", metadata: { field } } });
    return new Response(image.data, { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch (e) { return Response.json({ success: false, error: { message: e.status ? e.message : "Unable to load document." } }, { status: e.status || 500 }); }
}
