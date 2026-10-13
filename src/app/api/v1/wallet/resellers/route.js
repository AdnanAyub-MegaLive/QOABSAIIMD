import { prisma } from "@/lib/prisma";
import { teamRequest } from "@/lib/team-api";
import { eligibleResellerWhere, activeSpecialIdWhere } from "@/lib/diamond-service-rules";
import { avatarDisplayUrl } from "@/lib/avatar-history";
import { requestOrigin } from "@/lib/user-perks";
import { v1Options } from "@/lib/mobile-v1";
export function OPTIONS(request) { return v1Options(request, "GET, OPTIONS"); }
export async function GET(request) {
  return teamRequest(request, "/api/v1/wallet/resellers", "GET, OPTIONS", async user => {
    const query = new URL(request.url).searchParams;
    const page = Number(query.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw Object.assign(new Error("Invalid page."), { code: "VALIDATION_ERROR" });
    const q = (query.get("q") || "").trim().slice(0, 100);
    const rows = await prisma.user.findMany({ where: { ...eligibleResellerWhere(user), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { publicId: { contains: q, mode: "insensitive" } }, { specialIds: { some: { ...activeSpecialIdWhere(), specialId: { contains: q, mode: "insensitive" } } } }] } : {}) }, select: { publicId: true, name: true, country: true, profileImage: true, specialIds: { where: activeSpecialIdWhere(), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { specialId: true } } }, orderBy: [{ name: "asc" }, { publicId: "asc" }], skip: (page - 1) * 20, take: 21 });
    return { page, hasMore: rows.length > 20, items: rows.slice(0, 20).map(row => ({ publicId: row.publicId, displayId: row.specialIds[0]?.specialId ?? row.publicId, name: row.name, country: row.country, profileImage: avatarDisplayUrl(row.profileImage, requestOrigin(request)) })) };
  });
}
