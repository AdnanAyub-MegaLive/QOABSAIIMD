import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { profileAccess, medalWall, receivedGiftWall, wallOffset, wallCursor } from "@/lib/public-profile";
import { avatarDisplayUrl } from "@/lib/avatar-history";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const viewer = await requireMobileUser(request), { publicId } = await params;
    const { target } = await profileAccess(viewer, publicId);
    const query = new URL(request.url).searchParams, type = query.get("type") ?? "photos";
    const limit = Number(query.get("limit") ?? 20), cursor = query.get("cursor"), origin = requestOrigin(request);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("VALIDATION_ERROR");
    if (type === "badges") return mobileJson({ success: true, data: { type, ...await medalWall(target.id, origin, { limit, cursor }) } });
    if (type === "gifts") return mobileJson({ success: true, data: { type, ...await receivedGiftWall(target.id, origin, { limit, cursor }) } });
    if (type !== "photos") throw new Error("VALIDATION_ERROR");
    const offset = wallOffset(cursor);
    const rows = await prisma.userAlbumItem.findMany({ where: { userId: target.id, status: "APPROVED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: offset, take: limit + 1 });
    return mobileJson({ success: true, data: { type, items: rows.slice(0, limit).map(row => ({ id: row.id, mediaUrl: avatarDisplayUrl(row.mediaUrl, origin), mediaType: row.mediaType, caption: row.caption, createdAt: row.createdAt })), nextCursor: rows.length > limit ? wallCursor(offset + limit) : null } });
  } catch (error) { return mobileApiError(error, "PROFILE_WALL_FAILED"); }
}
