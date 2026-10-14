import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { audioRoomParticipantIds } from "@/lib/realtime";
import { activeRoomBan } from "@/lib/audio-room-management";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request), { roomId } = await params;
    if (isRateLimited(`gift-events:${user.id}`, { limit: 60, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Please wait before checking again." } }, 429);
    const room = await prisma.audioRoom.findUnique({ where: { roomId } });
    if (!room || room.status !== "LIVE" || room.isBlocked || await activeRoomBan(room.id, user.id) || !(await audioRoomParticipantIds(roomId)).has(user.publicId))
      return mobileJson({ success: false, error: { code: "JOIN_ROOM_FIRST", message: "Rejoin an accessible room before recovering its gift events." } }, 403);
    const query = new URL(request.url).searchParams;
    const since = new Date(query.get("since") || Date.now() - 600000);
    if (Number.isNaN(since.getTime())) throw Object.assign(new Error("Use an ISO timestamp for since."), { code: "VALIDATION_ERROR" });
    const floor = new Date(Math.max(Date.now() - 600000, room.startedAt?.getTime() || 0, since.getTime()));
    const afterId = query.get("afterId");
    const where = { channel: `audio-room:${roomId}`, event: { in: ["gift:received", "gift:received-multi"] }, createdAt: { gte: floor } };
    if (afterId) {
      const cursor = await prisma.realtimeOutbox.findFirst({ where: { ...where, id: afterId }, select: { createdAt: true, id: true } });
      if (!cursor) return mobileJson({ success: false, error: { code: "GIFT_REPLAY_CURSOR_EXPIRED", message: "Restart recovery within the ten-minute replay window; use gift history for older transactions." } }, 409);
      where.OR = [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }];
    }
    const rows = await prisma.realtimeOutbox.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 51 });
    const page = rows.slice(0, 50);
    return mobileJson({ success: true, data: { roomId, replayWindowSeconds: 600, hasMore: rows.length > 50, nextCursor: page.at(-1)?.id ?? afterId ?? null, events: page.map(row => ({ event: row.event, createdAt: row.createdAt.toISOString(), payload: { ...row.payload, data: { ...row.payload.data, eventId: row.id, recovered: true } } })) } });
  } catch (error) { return mobileApiError(error, "GIFT_EVENT_RECOVERY_FAILED"); }
}
