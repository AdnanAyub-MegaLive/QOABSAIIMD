import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { APPLICATION_ROLES, displayApplicationRole } from "@/lib/user-roles";
const fail = message => Object.assign(new Error(message), { status: 422, code: "VALIDATION_ERROR" });
const errorResponse = error => Response.json({ success: false, error: { code: error.code ?? "PROFILE_DISPLAY_FAILED", message: error.status ? error.message : "Unable to update profile display." } }, { status: error.status ?? 500 });
export async function GET() {
  try {
    await requirePermission("users.edit");
    const [roles, assets] = await Promise.all([prisma.roleBadge.findMany(), prisma.uploadAsset.findMany({ where: { active: true, category: { in: ["MEDALS", "ROLE_ARTWORK", "AGENCY_ARTWORK"] } }, select: { publicId: true, name: true, category: true }, take: 1000 })]);
    return Response.json({ success: true, data: { assets, roles: APPLICATION_ROLES.map(code => ({ code, label: displayApplicationRole(code), assetPublicId: null, ...roles.find(r => r.code === code) })) } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  try {
    const admin = await requirePermission("users.edit"), body = await request.json();
    if (body.action === "AGENCY") await requirePermission("agencies.manage");
    const result = await prisma.$transaction(async tx => {
      async function asset(id, category) {
        if (!id) return null;
        const row = await tx.uploadAsset.findFirst({ where: { publicId: String(id), category, active: true } });
        if (!row) throw fail(`Choose active ${category} artwork.`);
        return row.publicId;
      }
      let row;
      if (body.action === "ROLE") {
        if (!APPLICATION_ROLES.includes(body.code) || typeof body.label !== "string" || !body.label.trim() || body.label.length > 80) throw fail("Choose a role and a label up to 80 characters.");
        const data = { label: body.label.trim(), assetPublicId: await asset(body.assetPublicId, "ROLE_ARTWORK") };
        row = await tx.roleBadge.upsert({ where: { code: body.code }, create: { code: body.code, ...data }, update: data });
      } else if (body.action === "AGENCY") {
        const agency = await tx.agency.findUnique({ where: { publicId: String(body.agencyId ?? "") } });
        const level = Number(body.level);
        if (!agency || !Number.isSafeInteger(level) || level < 0 || level > 10000) throw fail("Choose an agency and a valid level.");
        row = await tx.agency.update({ where: { id: agency.id }, data: { level, logoAssetPublicId: await asset(body.logoAssetPublicId, "AGENCY_ARTWORK"), badgeAssetPublicId: await asset(body.badgeAssetPublicId, "AGENCY_ARTWORK") }, select: { publicId: true } });
      } else if (body.action === "MEDAL") {
        const user = await tx.user.findFirst({ where: { publicId: String(body.userId ?? ""), status: "ACTIVE", deletedAt: null } });
        const assetId = await asset(body.assetPublicId, "MEDALS"), expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        if (!user || !assetId || (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))) throw fail("Choose a user, medal and valid future expiry.");
        const artwork = await tx.uploadAsset.findUnique({ where: { publicId: assetId } });
        row = await tx.userMedal.create({ data: { publicId: `MEDAL-${randomUUID()}`, userId: user.id, assetPublicId: assetId, name: artwork.name, expiresAt, pinned: body.pinned === true } });
      } else if (body.action === "REVOKE_MEDAL") {
        row = await tx.userMedal.update({ where: { publicId: String(body.medalId ?? "") }, data: { revokedAt: new Date() } });
      } else throw fail("Unsupported display action.");
      await tx.auditLog.create({ data: { adminId: admin.id, action: `PROFILE_DISPLAY_${body.action}`, category: "USER_MANAGEMENT", entityType: "ProfileDisplay", entityId: row.publicId ?? row.code, description: `${admin.name} updated ${body.action.toLowerCase()} profile display.` } });
      return { id: row.publicId ?? row.code };
    });
    return Response.json({ success: true, data: result });
  } catch (error) { return errorResponse(error); }
}
