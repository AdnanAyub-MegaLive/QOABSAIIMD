import { prisma } from "@/lib/prisma";
import { requireMobileRole, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { grantAgency } from "@/lib/agency-management";

export const dynamic = "force-dynamic";
const path = "/api/v1/bd/agencies";
const methods = "GET, POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const bd = await requireMobileRole(request, ["BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD"]);
      const agencies = await prisma.agency.findMany({ where: { bdUserId: bd.id },
        select: { publicId: true, name: true, status: true, owner: { select: { publicId: true, name: true } } },
        orderBy: { createdAt: "desc" }, take: 100 });
      return mobileJson({ success: true, data: { agencies } });
    } catch (error) { return mobileApiError(error); }
  });
}
export async function POST(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const bd = await requireMobileRole(request, ["BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD"]);
      const body = await request.json();
      const agency = await prisma.$transaction(tx => grantAgency(tx, body, { bdUserId: bd.id, name: bd.name }), { isolationLevel: "Serializable" });
      return mobileJson({ success: true, data: { agency } }, 201);
    } catch (error) { return mobileApiError(error); }
  });
}
