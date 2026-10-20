import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { MANAGEMENT_ROLE_ORDER } from "@/lib/user-roles";
import { normalizeCountryCode } from "@/lib/geo-country";

export const dynamic = "force-dynamic";
export async function GET(request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const admin = await requirePermission("rules.hierarchy");
    if (admin.role !== "SUPER_ADMIN")
      return Response.json({ error: { message: "Only Platform Admin can view all management members." } }, { status: 403, headers });
    const params = new URL(request.url).searchParams;
    const role = params.get("role") || "";
    const countryInput = (params.get("country") || "").trim();
    const country = normalizeCountryCode(countryInput);
    if (countryInput && !country)
      return Response.json({ error: { message: "Choose a valid country." } }, { status: 422, headers });
    const q = (params.get("q") || "").trim().slice(0, 100);
    const page = Number(params.get("page") || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || (role && !MANAGEMENT_ROLE_ORDER.includes(role)))
      return Response.json({ error: { message: "Invalid role or page." } }, { status: 422, headers });
    const where = {
      deletedAt: null, status: "ACTIVE",
      ...(country ? { country: { equals: country, mode: "insensitive" } } : {}),
      AND: [
        { OR: [{ appRoles: { hasSome: role ? [role] : MANAGEMENT_ROLE_ORDER } }, { teamRole: { in: role ? [role] : MANAGEMENT_ROLE_ORDER } }] },
        ...(q ? [{ OR: ["name", "publicId", "country"].map(field => ({ [field]: { contains: q, mode: "insensitive" } })) }] : []),
      ],
    };
    const data = await prisma.$transaction(async tx => {
      const total = await tx.user.count({ where });
      const members = await tx.user.findMany({
        where, skip: (page - 1) * 25, take: 25, orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true, publicId: true, name: true, email: true, phone: true, country: true,
          appRoles: true, teamRole: true, status: true, createdAt: true, lastLoginAt: true,
          companyBdCountry: true, isVerified: true,
          supervisor: { select: { publicId: true, name: true, teamRole: true } },
          ownedAgencies: { select: { publicId: true, name: true, status: true } },
          _count: { select: { teamMembers: true } },
        },
      });
      const agencies = await tx.agency.findMany({
        where: { bdUserId: { in: members.map(m => m.id) } },
        select: { publicId: true, name: true, status: true, bdUserId: true },
      });
      return { total, page, pageSize: 25, members: members.map(({ id, ...member }) => ({
        ...member, supervisedAgencies: agencies.filter(a => a.bdUserId === id).map(({ bdUserId: _unused, ...agency }) => agency),
      })) };
    }, { isolationLevel: "RepeatableRead" });
    return Response.json({ success: true, data }, { headers });
  } catch (error) {
    return Response.json({ error: { message: error.status ? error.message : "Unable to load management members." } }, { status: error.status || 500, headers });
  }
}
