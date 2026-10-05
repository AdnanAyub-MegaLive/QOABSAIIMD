import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileJson } from "@/lib/mobile-api";
import { withV1Request, v1Options } from "@/lib/mobile-v1";

export const dynamic = "force-dynamic";
const path = "/api/v1/bds";
const methods = "GET, OPTIONS";
export function OPTIONS(request) { return v1Options(request, methods); }

export async function GET(request) {
  return withV1Request(request, { path, methods }, async () => {
    try {
      await requireMobileUser(request);
      const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
      const bds = await prisma.user.findMany({ where: { status: "ACTIVE", deletedAt: null, appRoles: { has: "BD" },
        ...(q ? { OR: [{ publicId: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}) },
        select: { publicId: true, name: true, profileImage: true }, orderBy: { publicId: "asc" }, take: 100 });
      return mobileJson({ success: true, data: { bds } });
    } catch (error) { return mobileApiError(error); }
  });
}
