import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { reviewAgency } from "@/lib/agency-management";
import { mobileApiError } from "@/lib/mobile-api";

export async function PATCH(request, { params }) {
  try {
    const admin = await requirePermission("agencies.manage");
    const { applicationId } = await params;
    const body = await request.json();
    const data = await prisma.$transaction(tx => reviewAgency(tx, applicationId, body, { adminId: admin.id, name: admin.name }), { isolationLevel: "Serializable" });
    return Response.json({ success: true, data: { ...data, reviewedBy: { name: admin.name, email: admin.email } } });
  } catch (error) {
    if (error.status) return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body." } }, { status: 400 });
    return mobileApiError(error, "REVIEW_FAILED");
  }
}
