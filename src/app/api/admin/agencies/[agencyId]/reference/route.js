import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { findAgencyReference, referenceDto } from "@/lib/agency-reference";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { mobileApiError } from "@/lib/mobile-api";
export async function PATCH(request, context) {
  try {
    const admin = await requirePermission("agencies.manage");
    const { agencyId } = await context.params;
    const body = await request.json();
    const bd = await prisma.$transaction(async tx => {
      const agency = await tx.agency.findUnique({ where: { publicId: agencyId } });
      if (!agency) throw new Error("AGENCY_NOT_FOUND");
      const reference = await findAgencyReference(tx, body.bdCode, agency.country);
      await tx.agency.update({ where: { id: agency.id }, data: { bdUserId: reference.id } });
      await tx.auditLog.create({ data: { adminId: admin.id, action: "CHANGE_AGENCY_REFERENCE", category: "AGENCY_MANAGEMENT", entityType: "Agency", entityId: agency.publicId, description: `Changed agency reference to ${reference.publicId}.`, metadata: { previousBdUserId: agency.bdUserId, bdUserId: reference.id } } });
      return reference;
    }, { isolationLevel: "Serializable" });
    return Response.json({ success: true, data: { bdReference: referenceDto(bd, await resolveUserPerks([bd], requestOrigin(request), ["FRAMES"])) } });
  } catch (error) {
    if (error.status) return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status });
    return mobileApiError(error, "AGENCY_REFERENCE_UPDATE_FAILED");
  }
}
