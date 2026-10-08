import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson, mobileOptions } from "@/lib/mobile-api";
import { changeProfileRelationship } from "@/lib/profile-relationships";
import { isRateLimited } from "@/lib/rate-limit";
export const OPTIONS = mobileOptions;
export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`profile-relationship:${user.id}`, { limit: 10, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Too many relationship changes." } }, 429);
    const data = await changeProfileRelationship(prisma, user.id, await request.json());
    return mobileJson({ success: true, data });
  } catch (error) {
    if (error.status) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
    if (error.code === "P2034") return mobileJson({ success: false, error: { code: "RELATIONSHIP_CONFLICT", message: "Another change occurred. Refresh and retry." } }, 409);
    return mobileApiError(error, "RELATIONSHIP_FAILED");
  }
}
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const rows = await prisma.profileRelationship.findMany({ where: { status: "PENDING", expiresAt: { gt: new Date() }, left: { status: "ACTIVE", deletedAt: null }, right: { status: "ACTIVE", deletedAt: null }, OR: [{ leftUserId: user.id }, { rightUserId: user.id }] }, orderBy: { publicId: "asc" }, take: 50, include: { left: { select: { publicId: true, name: true } }, right: { select: { publicId: true, name: true } } } });
    return mobileJson({ success: true, data: { items: rows.map(row => ({ id: row.publicId, type: row.type, status: row.status, direction: (row.leftUserId === user.id ? row.leftAcceptedAt : row.rightAcceptedAt) ? "SENT" : "RECEIVED", partner: row.leftUserId === user.id ? row.right : row.left, expiresAt: row.expiresAt })) } });
  } catch (error) { return mobileApiError(error, "RELATIONSHIP_READ_FAILED"); }
}
