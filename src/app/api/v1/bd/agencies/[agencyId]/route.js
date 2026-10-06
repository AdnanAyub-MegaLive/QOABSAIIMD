import { prisma } from "@/lib/prisma";
import { requireMobileRole, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { unlinkBDAgency } from "@/lib/agency-management";

const path = "/api/v1/bd/agencies/:agencyId";
const methods = "DELETE, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }
export async function DELETE(request, context) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 20, windowMs: 60000 } }, async () => {
    try {
      const bd = await requireMobileRole(request, ["BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD"]);
      const { agencyId } = await context.params;
      const data = await prisma.$transaction(tx => unlinkBDAgency(tx, bd.id, agencyId), { isolationLevel: "Serializable" });
      return mobileJson({ success: true, data });
    } catch (error) { return mobileApiError(error, "AGENCY_UNLINK_FAILED"); }
  });
}
