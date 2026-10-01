import { portalPermissionError } from "@/lib/portal-admin";
import { auth } from "../../../../../../auth";
import { prisma } from "../../../../../lib/prisma";
import { generateNumericPublicId } from "../../../../../lib/public-id";

function json(body, status = 200) {
  return Response.json(body, { status });
}

export async function PATCH(request, { params }) {
  const permissionDenied = await portalPermissionError("agencies.manage");
  if (permissionDenied) return permissionDenied;

  const session = await auth();
  if (!session?.user?.email)
    return json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Administrator authentication is required.",
        },
      },
      401,
    );
  const admin = await prisma.admin.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!admin?.active)
    return json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "An active administrator account is required.",
        },
      },
      401,
    );

  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        error: {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON.",
        },
      },
      400,
    );
  }
  const decision = String(body?.decision ?? "")
    .trim()
    .toUpperCase();
  const note = String(body?.note ?? "")
    .trim()
    .slice(0, 1000);
  if (decision !== "APPROVED" && decision !== "REJECTED")
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Decision must be APPROVED or REJECTED.",
        },
      },
      422,
    );
  if (decision === "REJECTED" && !note)
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "A rejection reason is required.",
        },
      },
      422,
    );
  const { applicationId } = await params;

  try {
    const reviewed = await prisma.$transaction(async (tx) => {
      const current = await tx.agencyApplication.findUniqueOrThrow({
        where: { publicId: applicationId },
        select: {
          id: true,
          publicId: true,
          status: true,
          agencyName: true,
          user: { select: { id: true, publicId: true, name: true } },
        },
      });
      if (current.status !== "PENDING") {
        const error = new Error("This application has already been reviewed.");
        error.code = "ALREADY_REVIEWED";
        throw error;
      }
      const reviewedAt = new Date();
      const changed = await tx.agencyApplication.updateMany({
        where: { id: current.id, status: "PENDING" },
        data: {
          status: decision,
          reviewedById: admin.id,
          reviewedAt,
          reviewNote: decision === "APPROVED" ? note || null : null,
          rejectionReason: decision === "REJECTED" ? note : null,
        },
      });
      if (!changed.count) {
        const error = new Error("This application has already been reviewed.");
        error.code = "ALREADY_REVIEWED";
        throw error;
      }
      let agency = null;
      if (decision === "APPROVED") {
        const agencyPublicId = await generateNumericPublicId("AGN", async (candidate) =>
          tx.agency.findUnique({ where: { publicId: candidate }, select: { id: true } }),
        );
        agency = await tx.agency.create({
          data: {
            publicId: agencyPublicId,
            name: current.agencyName,
            ownerUserId: current.user.id,
          },
        });
        await tx.agencyApplication.update({
          where: { id: current.id },
          data: { agencyId: agency.id },
        });
      }
      await tx.auditLog.create({
        data: {
          adminId: admin.id,
          action: `AGENCY_APPLICATION_${decision}`,
          category: "AGENCY_MANAGEMENT",
          entityType: "AgencyApplication",
          entityId: current.publicId,
          description: `${admin.name} ${decision.toLowerCase()} agency application ${current.publicId} for ${current.agencyName}.`,
          metadata: {
            decision,
            note: note || null,
            userId: current.user.publicId,
            applicant: current.user.name,
            agencyName: current.agencyName,
          },
        },
      });
      return { status: decision, reviewedAt, note: note || null, agency };
    });
    return json({
      success: true,
      data: {
        applicationId,
        status: reviewed.status,
        agency: reviewed.agency
          ? { id: reviewed.agency.publicId, name: reviewed.agency.name }
          : null,
        reviewedAt: reviewed.reviewedAt.toISOString(),
        reviewNote: decision === "APPROVED" ? reviewed.note : null,
        rejectionReason: decision === "REJECTED" ? reviewed.note : null,
        reviewedBy: { name: admin.name, email: admin.email },
      },
    });
  } catch (error) {
    if (error?.code === "P2025")
      return json(
        {
          success: false,
          error: {
            code: "APPLICATION_NOT_FOUND",
            message: "Agency application not found.",
          },
        },
        404,
      );
    if (error?.code === "ALREADY_REVIEWED")
      return json(
        { success: false, error: { code: error.code, message: error.message } },
        409,
      );
    console.error("Agency application review failed", error);
    return json(
      {
        success: false,
        error: {
          code: "REVIEW_FAILED",
          message: "Unable to review this application right now.",
        },
      },
      500,
    );
  }
}
