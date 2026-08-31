import { prisma } from "@/lib/prisma";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { emitToUser } from "@/lib/realtime";
import { primaryLegacyRole } from "@/lib/user-roles";
import { talentPublicIdForApprovedHost } from "@/lib/host-public-id";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request, { params }) {
  try {
    const owner = await requireMobileUser(request);
    let body;
    try {
      body = await request.json();
    } catch {
      const error = new Error("Request body must be valid JSON.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    if (typeof body?.accept !== "boolean") {
      const error = new Error("accept must be true or false.");
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    const { requestId } = await params;
    const joinRequest = await prisma.agencyJoinRequest.findUnique({
      where: { publicId: decodeURIComponent(requestId) },
      select: {
        id: true,
        publicId: true,
        status: true,
        agencyId: true,
        user: {
          select: {
            id: true,
            publicId: true,
            agencyId: true,
            appRoles: true,
            role: true,
          },
        },
        agency: {
          select: {
            publicId: true,
            name: true,
            status: true,
            ownerUserId: true,
          },
        },
      },
    });
    if (!joinRequest) {
      const error = new Error("Agency join request not found.");
      error.code = "REQUEST_NOT_FOUND";
      throw error;
    }
    if (joinRequest.agency.ownerUserId !== owner.id) {
      const error = new Error("You cannot respond to this agency's join requests.");
      error.code = "FORBIDDEN";
      throw error;
    }
    if (joinRequest.status !== "PENDING") {
      const error = new Error("This agency join request has already been resolved.");
      error.code = "REQUEST_ALREADY_RESOLVED";
      throw error;
    }
    if (body.accept && joinRequest.agency.status !== "ACTIVE") {
      const error = new Error("This agency is no longer active.");
      error.code = "AGENCY_INACTIVE";
      throw error;
    }
    if (body.accept && joinRequest.user.agencyId) {
      const error = new Error("This user already belongs to an agency.");
      error.code = "ALREADY_HAS_AGENCY";
      throw error;
    }

    const status = body.accept ? "APPROVED" : "REJECTED";
    const reviewedAt = new Date();
    const hostPublicId = body.accept
      ? talentPublicIdForApprovedHost(joinRequest.user.publicId)
      : joinRequest.user.publicId;
    if (hostPublicId !== joinRequest.user.publicId) {
      const conflict = await prisma.user.findUnique({
        where: { publicId: hostPublicId },
        select: { id: true },
      });
      if (conflict && conflict.id !== joinRequest.user.id) {
        const error = new Error("The Talent ID is already assigned.");
        error.code = "HOST_PUBLIC_ID_CONFLICT";
        throw error;
      }
    }
    await prisma.$transaction(async (tx) => {
      const changed = await tx.agencyJoinRequest.updateMany({
        where: { id: joinRequest.id, status: "PENDING" },
        data: { status, reviewedAt, reviewNote: body.accept ? "Approved by agency owner." : "Rejected by agency owner." },
      });
      if (!changed.count) {
        const error = new Error("This agency join request has already been resolved.");
        error.code = "REQUEST_ALREADY_RESOLVED";
        throw error;
      }
      if (body.accept) {
        const linked = await tx.user.updateMany({
          where: { id: joinRequest.user.id, agencyId: null },
          data: {
            publicId: hostPublicId,
            agencyId: joinRequest.agencyId,
            appRoles: {
              set: [...new Set([...joinRequest.user.appRoles, "HOST"])],
            },
            role: primaryLegacyRole(
              [...new Set([...joinRequest.user.appRoles, "HOST"])],
              joinRequest.user.role,
            ),
            isVerified: true,
            status: "ACTIVE",
            ...(hostPublicId !== joinRequest.user.publicId
              ? { sessionVersion: { increment: 1 } }
              : {}),
          },
        });
        if (!linked.count) {
          const error = new Error("This user already belongs to an agency.");
          error.code = "ALREADY_HAS_AGENCY";
          throw error;
        }
        if (hostPublicId !== joinRequest.user.publicId) {
          await tx.legacyIdMapping.updateMany({
            where: {
              userId: joinRequest.user.id,
              entityType: "USER",
              publicId: joinRequest.user.publicId,
            },
            data: { publicId: hostPublicId },
          });
          await tx.auditLog.updateMany({
            where: { entityType: "User", entityId: joinRequest.user.publicId },
            data: { entityId: hostPublicId },
          });
        }
      }
      await tx.auditLog.create({
        data: {
          action: `AGENCY_OWNER_JOIN_${status}`,
          category: "AGENCY_MANAGEMENT",
          entityType: "AgencyJoinRequest",
          entityId: joinRequest.publicId,
          description: `Agency owner ${owner.publicId} ${status.toLowerCase()} user ${hostPublicId}'s request to join ${joinRequest.agency.publicId}.`,
          metadata: {
            source: "MOBILE_AGENCY_OWNER",
            ownerId: owner.publicId,
            previousUserId: joinRequest.user.publicId,
            userId: hostPublicId,
            agencyId: joinRequest.agency.publicId,
            status,
          },
        },
      });
    });

    const payload = {
      success: true,
      data: {
        requestId: joinRequest.publicId,
        agencyId: joinRequest.agency.publicId,
        agencyName: joinRequest.agency.name,
        status,
        reviewedAt: reviewedAt.toISOString(),
        hostId: body.accept ? hostPublicId : undefined,
        sessionInvalidated: body.accept && hostPublicId !== joinRequest.user.publicId,
      },
    };
    emitToUser(joinRequest.user.publicId, "agency:join-responded", payload);
    return mobileJson(payload);
  } catch (error) {
    const statuses = {
      REQUEST_NOT_FOUND: 404,
      FORBIDDEN: 403,
      REQUEST_ALREADY_RESOLVED: 409,
      AGENCY_INACTIVE: 409,
      ALREADY_HAS_AGENCY: 409,
      HOST_PUBLIC_ID_CONFLICT: 409,
    };
    if (statuses[error?.code]) {
      return mobileJson(
        { success: false, error: { code: error.code, message: error.message } },
        statuses[error.code],
      );
    }
    console.error("Agency owner join response failed", error);
    return mobileApiError(error, "AGENCY_JOIN_RESPONSE_FAILED");
  }
}
