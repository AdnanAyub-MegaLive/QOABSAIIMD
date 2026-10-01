import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export function OPTIONS() { return mobileOptions(); }

export async function POST(request, { params }) {
  try {
    const sessionUser = await requireMobileUser(request);
    const { agencyId } = await params;
    const [agency, user] = await Promise.all([
      prisma.agency.findUnique({ where: { publicId: decodeURIComponent(agencyId) }, select: { id: true, publicId: true, name: true, status: true } }),
      prisma.user.findUnique({ where: { id: sessionUser.id }, select: { agencyId: true, agencyApplications: { where: { status: "APPROVED" }, select: { id: true }, take: 1 } } }),
    ]);
    if (!agency) return mobileJson({ success: false, error: { code: "AGENCY_NOT_FOUND", message: "Agency not found." } }, 404);
    if (agency.status !== "ACTIVE") return mobileJson({ success: false, error: { code: "AGENCY_INACTIVE", message: "This agency is not accepting join requests." } }, 403);
    if (user.agencyId || user.agencyApplications.length) return mobileJson({ success: false, error: { code: "ALREADY_HAS_AGENCY", message: "You already belong to or own an agency." } }, 409);
    const pending = await prisma.agencyJoinRequest.findFirst({ where: { userId: sessionUser.id, status: "PENDING" }, select: { publicId: true } });
    if (pending) return mobileJson({ success: false, error: { code: "ALREADY_REQUESTED", message: "You already have a pending agency join request." } }, 409);
    const publicId = `AGJ-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const created = await prisma.$transaction(async (tx) => {
      const joinRequest = await tx.agencyJoinRequest.create({ data: { publicId, userId: sessionUser.id, agencyId: agency.id }, select: { publicId: true, status: true } });
      await tx.auditLog.create({ data: { action: "AGENCY_JOIN_REQUESTED", category: "AGENCY_MANAGEMENT", entityType: "AgencyJoinRequest", entityId: publicId, description: `User ${sessionUser.publicId} requested to join agency ${agency.publicId}.`, metadata: { userId: sessionUser.publicId, agencyId: agency.publicId, agencyName: agency.name } } });
      return joinRequest;
    });
    return mobileJson({ success: true, data: { requestId: created.publicId, status: created.status } }, 201);
  } catch (error) {
    console.error("Agency join request failed", error);
    return mobileApiError(error, "AGENCY_JOIN_FAILED");
  }
}
