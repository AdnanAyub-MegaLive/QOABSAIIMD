import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { emitToUser } from "@/lib/realtime";
import { normalizeApplicationRoles, primaryLegacyRole } from "@/lib/user-roles";

export function OPTIONS() {
  return mobileOptions();
}

export async function DELETE(request, { params }) {
  try {
    const owner = await requireMobileUser(request);
    const { hostId } = await params;
    const host = await prisma.user.findFirst({
      where: { publicId: decodeURIComponent(hostId), deletedAt: null },
      select: {
        id: true,
        publicId: true,
        agencyId: true,
        appRoles: true,
        role: true,
        agency: { select: { publicId: true, ownerUserId: true } },
      },
    });
    if (!host || !host.agencyId)
      return mobileJson(
        { success: false, error: { code: "HOST_NOT_FOUND", message: "Agency host not found." } },
        404,
      );
    if (host.agency?.ownerUserId !== owner.id)
      return mobileJson(
        { success: false, error: { code: "FORBIDDEN", message: "This host does not belong to your agency." } },
        403,
      );
    const remainingRoles = normalizeApplicationRoles(
      host.appRoles.filter((role) => role !== "HOST"),
    );
    await prisma.$transaction(async (tx) => {
      const removed = await tx.user.updateMany({
        where: { id: host.id, agencyId: host.agencyId },
        data: {
          agencyId: null,
          appRoles: { set: remainingRoles },
          role: primaryLegacyRole(remainingRoles, host.role),
          isVerified: false,
        },
      });
      if (!removed.count) {
        const error = new Error("This host no longer belongs to your agency.");
        error.code = "FORBIDDEN";
        throw error;
      }
      await tx.agencyJoinRequest.updateMany({
        where: { userId: host.id, agencyId: host.agencyId, status: "APPROVED" },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewNote: "Agency membership removed by agency owner.",
        },
      });
      await tx.auditLog.create({
        data: {
          action: "AGENCY_HOST_REMOVED",
          category: "AGENCY_MANAGEMENT",
          entityType: "User",
          entityId: host.publicId,
          description: `Agency owner ${owner.publicId} removed host ${host.publicId} from ${host.agency.publicId}.`,
          metadata: {
            source: "MOBILE_AGENCY_OWNER",
            ownerId: owner.publicId,
            hostId: host.publicId,
            agencyId: host.agency.publicId,
            preservedSalaryCoinBalance: true,
          },
        },
      });
    });
    const payload = {
      success: true,
      data: { hostId: host.publicId, agencyId: host.agency.publicId },
    };
    emitToUser(host.publicId, "agency:host-removed", payload);
    return mobileJson(payload);
  } catch (error) {
    if (error?.code === "FORBIDDEN")
      return mobileJson(
        { success: false, error: { code: error.code, message: error.message } },
        403,
      );
    console.error("Agency host removal failed", error);
    return mobileApiError(error, "AGENCY_HOST_REMOVE_FAILED");
  }
}
