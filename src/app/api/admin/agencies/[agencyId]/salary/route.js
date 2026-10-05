import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { getAgencySalary } from "@/lib/agency-salary";
import { mobileApiError } from "@/lib/mobile-api";
export async function GET(request, context) {
  try {
    await requirePermission("agencies.view");
    const { agencyId } = await context.params;
    const agency = await prisma.agency.findUnique({ where: { publicId: agencyId }, select: { id: true } });
    if (!agency) throw new Error("AGENCY_NOT_FOUND");
    return Response.json({ success: true, data: await getAgencySalary(agency.id, new URL(request.url).searchParams.get("month")) });
  } catch (error) {
    if (error.status) return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
    return mobileApiError(error, "AGENCY_SALARY_FAILED");
  }
}
