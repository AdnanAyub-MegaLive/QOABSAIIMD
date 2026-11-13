import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { requireReferenceUser, applicantSelect, applicantDto } from "@/lib/agency-reference";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { grantAgency } from "@/lib/agency-management";

export const dynamic = "force-dynamic";
const path = "/api/v1/bd/agencies";
const methods = "GET, POST, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const bd = await requireReferenceUser(await requireMobileUser(request));
      const cursor = new URL(request.url).searchParams.get("cursor");
      const agencies = await prisma.agency.findMany({ where: { bdUserId: bd.id },
        select: { publicId: true, name: true, status: true, owner: { select: applicantSelect } },
        orderBy: { publicId: "asc" }, ...(cursor?{cursor:{publicId:cursor},skip:1}:{}), take: 101 });
      const hasMore=agencies.length>100;
      const page=agencies.slice(0,100);
      const origin = requestOrigin(request);
      const perks = await resolveUserPerks(page.map(a => a.owner).filter(Boolean), origin, ["FRAMES"]);
      return mobileJson({ success: true, data: { agencies:page.map(agency => ({ ...agency, owner: applicantDto(agency.owner, perks, origin) })), nextCursor:hasMore?page.at(-1).publicId:null } });
    } catch (error) { return mobileApiError(error); }
  });
}
export async function POST(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const bd = await requireReferenceUser(await requireMobileUser(request));
      const body = await request.json();
      const agency = await prisma.$transaction(tx => grantAgency(tx, body, { bdUserId: bd.id, name: bd.name }), { isolationLevel: "Serializable" });
      return mobileJson({ success: true, data: { agency } }, 201);
    } catch (error) { return mobileApiError(error); }
  });
}
