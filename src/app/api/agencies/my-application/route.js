import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson, mobileOptions } from "@/lib/mobile-api";
import { referenceDto } from "@/lib/agency-reference";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
export const dynamic = "force-dynamic";
export const OPTIONS = mobileOptions;
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const latest = await prisma.agencyApplication.findFirst({ where: { userId: user.id },
      select: { publicId: true, status: true, agencyName: true, createdAt: true, bd: { select: { id: true, publicId: true, name: true, profileImage: true, appRoles: true, country: true } } }, orderBy: { createdAt: "desc" } });
    const perks = await resolveUserPerks(latest?.bd ? [latest.bd] : [], requestOrigin(request), ["FRAMES"]);
    const application = !latest || latest.status === "REJECTED" ? null : { applicationId: latest.publicId, status: latest.status, agencyName: latest.agencyName, createdAt: latest.createdAt.toISOString(), bdReference: referenceDto(latest.bd, perks) };
    return mobileJson({ success: true, data: { application } });
  } catch (error) { return mobileApiError(error, "APPLICATION_READ_FAILED"); }
}
