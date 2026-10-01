import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const latest = await prisma.agencyJoinRequest.findFirst({
      where: { userId: user.id },
      select: { publicId: true, status: true, createdAt: true, agency: { select: { publicId: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const joinRequest = !latest || latest.status === "REJECTED" ? null : { requestId: latest.publicId, agencyId: latest.agency.publicId, agencyName: latest.agency.name, status: latest.status, createdAt: latest.createdAt.toISOString() };
    return mobileJson({ success: true, data: { request: joinRequest } });
  } catch (error) {
    console.error("Agency join status failed", error);
    return mobileApiError(error, "AGENCY_JOIN_STATUS_FAILED");
  }
}
