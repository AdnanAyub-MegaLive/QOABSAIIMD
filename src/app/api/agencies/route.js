import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const agencies = await prisma.agency.findMany({
      where: { status: "ACTIVE", ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
      select: { publicId: true, name: true, _count: { select: { userHosts: true } } },
      orderBy: [{ userHosts: { _count: "desc" } }, { createdAt: "desc" }],
      take: 100,
    });
    return mobileJson({ success: true, data: { agencies: agencies.map((agency) => ({ id: agency.publicId, name: agency.name, hostCount: agency._count.userHosts })) } });
  } catch (error) {
    console.error("Agency browse failed", error);
    return mobileApiError(error, "AGENCY_LIST_FAILED");
  }
}
