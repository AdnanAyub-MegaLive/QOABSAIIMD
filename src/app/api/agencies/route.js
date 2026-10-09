import { prisma } from "@/lib/prisma";
import { normalizeCountryCode } from "@/lib/geo-country";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim().slice(0, 100) ?? "";
    const requestedCountry = params.get("country")?.trim();
    const country = normalizeCountryCode(requestedCountry);
    if (requestedCountry && !country) return mobileJson({ success: false, error: { code: "VALIDATION_ERROR", message: "country must be a valid ISO alpha-2 code." } }, 422);
    // An omitted query is browsing; an explicitly empty query is an empty search.
    if (params.has("q") && !q) return mobileJson({ success: true, data: { agencies: [] } });
    const agencies = await prisma.agency.findMany({
      where: { status: "ACTIVE", ...(country ? { country } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { publicId: { contains: q, mode: "insensitive" } }] } : {}) },
      select: { publicId: true, name: true, country: true, level: true, _count: { select: { userHosts: true } } },
      orderBy: [{ userHosts: { _count: "desc" } }, { name: "asc" }, { publicId: "asc" }],
      take: 100,
    });
    return mobileJson({ success: true, data: { agencies: agencies.map((agency) => ({ id: agency.publicId, name: agency.name, hostCount: agency._count.userHosts, country: normalizeCountryCode(agency.country), level: agency.level })) } });
  } catch (error) {
    console.error("Agency browse failed", error);
    return mobileApiError(error, "AGENCY_LIST_FAILED");
  }
}
