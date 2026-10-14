import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { isRateLimited } from "@/lib/rate-limit";
import { roomAccessCheck } from "@/lib/room-access-check";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`room-access:${user.id}`, { limit: 60, windowMs: 60000 })) {
      const response = await mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Please wait before checking room access again." } }, 429);
      response.headers.set("Retry-After", "60"); return response;
    }
    const { roomId } = await params;
    const room = await prisma.audioRoom.findUnique({ where: { roomId } });
    return mobileJson({ success: true, data: { ...await roomAccessCheck(prisma, room, user.id), roomId } });
  } catch (error) { return mobileApiError(error, "ROOM_ACCESS_FAILED"); }
}
