import { prisma } from "@/lib/prisma";
import { getAgencySalary } from "@/lib/agency-salary";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
export const OPTIONS = mobileOptions;
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const agency = await prisma.agency.findUnique({ where: { ownerUserId: user.id }, select: { id: true } });
    if (!agency) throw new Error("AGENCY_NOT_FOUND");
    return mobileJson({ success: true, data: await getAgencySalary(agency.id, new URL(request.url).searchParams.get("month")) });
  } catch (error) { return mobileApiError(error, "AGENCY_SALARY_FAILED"); }
}
