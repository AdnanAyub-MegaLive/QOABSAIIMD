import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { grantAgency } from "@/lib/agency-management";
import { mobileApiError } from "@/lib/mobile-api";

export async function POST(request) {
  try {
    const admin = await requirePermission("agencies.manage");
    const body = await request.json();
    const agency = await prisma.$transaction(tx => grantAgency(tx, body, { adminId: admin.id, name: admin.name }), { isolationLevel: "Serializable" });
    return Response.json({ success: true, data: { agency } }, { status: 201 });
  } catch (error) {
    if (error.status) return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ success: false, error: { code: "INVALID_JSON", message: "Invalid JSON body." } }, { status: 400 });
    return mobileApiError(error, "AGENCY_CREATE_FAILED");
  }
}
