import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { discoverableRoomWhere, liveCountryCounts } from "@/lib/room-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const rows = await prisma.audioRoom.groupBy({
      by: ["country"],
      where: { ...discoverableRoomWhere(user.id), country: { not: null } },
      _count: { _all: true },
    });
    return mobileJson({ success: true, data: { countries: liveCountryCounts(rows) } });
  } catch (error) {
    return mobileApiError(error, "ROOM_COUNTRIES_FAILED");
  }
}
