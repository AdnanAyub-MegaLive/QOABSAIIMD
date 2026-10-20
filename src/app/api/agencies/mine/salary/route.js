import { prisma } from "@/lib/prisma";
import { requestOrigin } from "@/lib/user-perks";
import { getAgencySalary } from "@/lib/agency-salary";
import { ownedAgencySelection } from "@/lib/agency-ownership";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
export const OPTIONS = mobileOptions;
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const agency = await ownedAgencySelection(prisma,user.id,new URL(request.url).searchParams.get("agencyId"));
    if (!agency) throw new Error("AGENCY_NOT_FOUND");
    return mobileJson({ success: true, data: await getAgencySalary(agency.id, new URL(request.url).searchParams.get("month"), prisma, requestOrigin(request)) });
  } catch (error) { return mobileApiError(error, "AGENCY_SALARY_FAILED"); }
}
