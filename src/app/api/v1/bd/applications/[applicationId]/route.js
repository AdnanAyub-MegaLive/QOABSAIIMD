import { prisma } from "@/lib/prisma";
import { requireMobileRole, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { reviewAgency } from "@/lib/agency-management";

export const dynamic = "force-dynamic";
const path = "/api/v1/bd/applications/[applicationId]";
const methods = "PATCH, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function PATCH(request, { params }) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const bd = await requireMobileRole(request, ["BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD"]);
      const { applicationId } = await params;
      const body = await request.json();
      const data = await prisma.$transaction(tx => reviewAgency(tx, applicationId, body, { bdUserId: bd.id, name: bd.name }), { isolationLevel: "Serializable" });
      return mobileJson({ success: true, data });
    } catch (error) { return mobileApiError(error); }
  });
}
