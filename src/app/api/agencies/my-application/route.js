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
      select: { publicId: true, status: true, agencyName: true, createdAt: true, reviewedAt: true, rejectionReason: true, bdUserId: true, bd: { select: { id: true, publicId: true, name: true, profileImage: true, appRoles: true, country: true } } }, orderBy: { createdAt: "desc" } });
    const perks = await resolveUserPerks(latest?.bd ? [latest.bd] : [], requestOrigin(request), ["FRAMES"]);
    const rejections = latest?.status === "REJECTED" ? await prisma.agencyApplication.count({ where: { userId: user.id, bdUserId: latest.bdUserId, status: "REJECTED" } }) : 0;
    const includeRejected = new URL(request.url).searchParams.get("includeRejected") === "1";
    const application = !latest || (latest.status === "REJECTED" && !includeRejected) ? null : { applicationId: latest.publicId, status: latest.status, agencyName: latest.agencyName, createdAt: latest.createdAt.toISOString(), bdReference: referenceDto(latest.bd, perks),
      ...(latest.status === "REJECTED" ? { rejectionReason: latest.rejectionReason ?? null, reviewedAt: latest.reviewedAt?.toISOString() ?? null, attemptsRemaining: Math.max(0, 3 - rejections) } : {}) };
    return mobileJson({ success: true, data: { application } });
  } catch (error) { return mobileApiError(error, "APPLICATION_READ_FAILED"); }
}
