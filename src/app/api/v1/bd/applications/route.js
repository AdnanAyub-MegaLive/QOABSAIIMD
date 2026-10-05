import { prisma } from "@/lib/prisma";
import { requireMobileRole, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";

export const dynamic = "force-dynamic";
const path = "/api/v1/bd/applications";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const bd = await requireMobileRole(request, ["BD"]);
      const status = new URL(request.url).searchParams.get("status") || "PENDING";
      if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) throw new Error("AGENCY_REVIEW_INVALID");
      const applications = await prisma.agencyApplication.findMany({ where: { bdUserId: bd.id, status },
        select: { publicId: true, agencyName: true, whatsapp: true, status: true, createdAt: true, reviewedAt: true, reviewNote: true, rejectionReason: true, user: { select: { publicId: true, name: true } } },
        orderBy: { createdAt: "desc" }, take: 100 });
      return mobileJson({ success: true, data: { applications } });
    } catch (error) { return mobileApiError(error); }
  });
}
