import { prisma } from "@/lib/prisma";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { activeRoomBan } from "@/lib/audio-room-management";
import { readRoomChatHistory } from "@/lib/audio-room-chat";
import { requestOrigin } from "@/lib/user-perks";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { roomId } = await params;
    const room = await prisma.audioRoom.findUnique({ where: { roomId: decodeURIComponent(roomId) }, select: { id: true, roomId: true, status: true, isBlocked: true, chatRevision: true } });
    if (!room || room.isBlocked || room.status === "TERMINATED") throw Object.assign(new Error("Room is unavailable."), { code: "ROOM_UNAVAILABLE" });
    if (await activeRoomBan(room.id, user.id)) throw Object.assign(new Error("You are blocked from this room."), { code: "ROOM_BLOCKED" });
    const url = new URL(request.url);
    const data = await readRoomChatHistory(room, requestOrigin(request), { cursor: url.searchParams.get("cursor"), limit: url.searchParams.get("limit") });
    return mobileJson({ success: true, data });
  } catch (error) { return mobileApiError(error, "ROOM_CHAT_HISTORY_FAILED"); }
}
