import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { requireReferenceUser, applicantSelect, applicantDto } from "@/lib/agency-reference";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";

export const dynamic = "force-dynamic";
const path = "/api/v1/bd/applications";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const bd = await requireReferenceUser(await requireMobileUser(request));
      const status = new URL(request.url).searchParams.get("status") || "PENDING";
      if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) throw new Error("AGENCY_REVIEW_INVALID");
      const applications = await prisma.agencyApplication.findMany({ where: { bdUserId: bd.id, status },
        select: { publicId: true, agencyName: true, whatsapp: true, status: true, createdAt: true, reviewedAt: true, reviewNote: true, rejectionReason: true, user: { select: applicantSelect } },
        orderBy: { createdAt: "desc" }, take: 100 });
      const origin = requestOrigin(request);
      const perks = await resolveUserPerks(applications.map(a => a.user).filter(Boolean), origin, ["FRAMES"]);
      return mobileJson({ success: true, data: { applications: applications.map(({ whatsapp, user, ...application }) => ({ ...application, whatsapp: application.status === "PENDING" ? whatsapp : null, user: applicantDto(user, perks, origin) })) } });
    } catch (error) { return mobileApiError(error); }
  });
}
