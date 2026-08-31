import { auth } from "../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { talentPublicIdForApprovedHost } from "@/lib/host-public-id";
import { emitToUser } from "@/lib/realtime";
import { primaryLegacyRole } from "@/lib/user-roles";

const json = (body, status = 200) => Response.json(body, { status });

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.email) return json({ success: false, error: { code: "UNAUTHORIZED", message: "Administrator authentication is required." } }, 401);
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email.toLowerCase() }, select: { id: true, name: true, email: true, active: true } });
  if (!admin?.active) return json({ success: false, error: { code: "UNAUTHORIZED", message: "An active administrator account is required." } }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ success: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400); }
  const decision = String(body?.decision ?? "").trim().toUpperCase();
  const note = String(body?.note ?? "").trim().slice(0, 1000);
  if (!new Set(["APPROVED", "REJECTED"]).has(decision)) return json({ success: false, error: { code: "VALIDATION_ERROR", message: "Decision must be APPROVED or REJECTED." } }, 422);
  if (decision === "REJECTED" && !note) return json({ success: false, error: { code: "VALIDATION_ERROR", message: "A rejection reason is required." } }, 422);
  const { requestId } = await params;
  try {
    const reviewed = await prisma.$transaction(async (tx) => {
      const current = await tx.agencyJoinRequest.findUniqueOrThrow({ where: { publicId: requestId }, select: { id: true, publicId: true, status: true, user: { select: { id: true, publicId: true, name: true, agencyId: true, appRoles: true, role: true } }, agency: { select: { id: true, publicId: true, name: true, status: true } } } });
      if (current.status !== "PENDING") throw Object.assign(new Error("This join request has already been reviewed."), { code: "ALREADY_REVIEWED" });
      if (decision === "APPROVED" && current.user.agencyId) throw Object.assign(new Error("This user already belongs to an agency."), { code: "ALREADY_HAS_AGENCY" });
      if (decision === "APPROVED" && current.agency.status !== "ACTIVE") throw Object.assign(new Error("This agency is no longer active."), { code: "AGENCY_INACTIVE" });
      const hostPublicId = decision === "APPROVED" ? talentPublicIdForApprovedHost(current.user.publicId) : current.user.publicId;
      if (hostPublicId !== current.user.publicId) {
        const conflict = await tx.user.findUnique({ where: { publicId: hostPublicId }, select: { id: true } });
        if (conflict && conflict.id !== current.user.id) throw Object.assign(new Error("The Talent ID is already assigned."), { code: "HOST_PUBLIC_ID_CONFLICT" });
      }
      const reviewedAt = new Date();
      await tx.agencyJoinRequest.update({ where: { id: current.id }, data: { status: decision, reviewedById: admin.id, reviewedAt, reviewNote: note || null } });
      if (decision === "APPROVED") {
        const roles = [...new Set([...current.user.appRoles, "HOST"])];
        await tx.user.update({ where: { id: current.user.id }, data: { publicId: hostPublicId, agencyId: current.agency.id, appRoles: { set: roles }, role: primaryLegacyRole(roles, current.user.role), isVerified: true, status: "ACTIVE", ...(hostPublicId !== current.user.publicId ? { sessionVersion: { increment: 1 } } : {}) } });
        if (hostPublicId !== current.user.publicId) {
          await tx.legacyIdMapping.updateMany({ where: { userId: current.user.id, entityType: "USER", publicId: current.user.publicId }, data: { publicId: hostPublicId } });
          await tx.auditLog.updateMany({ where: { entityType: "User", entityId: current.user.publicId }, data: { entityId: hostPublicId } });
        }
      }
      await tx.auditLog.create({ data: { adminId: admin.id, action: `AGENCY_JOIN_${decision}`, category: "AGENCY_MANAGEMENT", entityType: "AgencyJoinRequest", entityId: current.publicId, description: `${admin.name} ${decision.toLowerCase()} ${hostPublicId}'s request to join ${current.agency.publicId}.`, metadata: { decision, note: note || null, previousUserId: current.user.publicId, userId: hostPublicId, agencyId: current.agency.publicId } } });
      return { current, reviewedAt, hostPublicId };
    });
    if (decision === "APPROVED" && reviewed.hostPublicId !== reviewed.current.user.publicId) {
      emitToUser(reviewed.current.user.publicId, "host:approved", {
        previousUserId: reviewed.current.user.publicId,
        userId: reviewed.hostPublicId,
        sessionInvalidated: true,
      });
    }
    return json({ success: true, data: { requestId, status: decision, userId: reviewed.hostPublicId, sessionInvalidated: decision === "APPROVED" && reviewed.hostPublicId !== reviewed.current.user.publicId, reviewedAt: reviewed.reviewedAt.toISOString(), reviewNote: note || null, reviewedBy: { name: admin.name, email: admin.email } } });
  } catch (error) {
    if (error?.code === "P2025") return json({ success: false, error: { code: "REQUEST_NOT_FOUND", message: "Agency join request not found." } }, 404);
    if (["ALREADY_REVIEWED", "ALREADY_HAS_AGENCY", "AGENCY_INACTIVE", "HOST_PUBLIC_ID_CONFLICT"].includes(error?.code)) return json({ success: false, error: { code: error.code, message: error.message } }, 409);
    console.error("Agency join review failed", error);
    return json({ success: false, error: { code: "REVIEW_FAILED", message: "Unable to review this join request." } }, 500);
  }
}
