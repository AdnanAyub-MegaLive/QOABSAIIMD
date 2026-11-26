import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
import { referenceWhere, referenceDto, referenceMatches } from "@/lib/agency-reference";
import { isRateLimited } from "@/lib/rate-limit";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";

export const dynamic = "force-dynamic";
const path = "/api/v1/bds";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      const applicant = await requireMobileUser(request);
      if (await isRateLimited(`bds:${applicant.id}`, { limit: 60, windowMs: 60000 })) throw new Error("RATE_LIMITED");
      const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
      const bds = referenceMatches(await prisma.user.findMany({ where: referenceWhere(applicant.country, q),
        select: { id: true, publicId: true, name: true, profileImage: true, country: true, appRoles: true }, orderBy: { publicId: "asc" }, take: 100 }), applicant.country);
      const perks = await resolveUserPerks(bds, requestOrigin(request), ["FRAMES"]);
      return mobileJson({ success: true, data: { bds: bds.map(user => referenceDto(user, perks)) } });
    } catch (error) { return mobileApiError(error); }
  });
}
