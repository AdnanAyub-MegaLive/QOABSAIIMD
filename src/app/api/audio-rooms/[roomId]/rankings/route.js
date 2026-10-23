import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { getRoomRankings } from "@/lib/room-rankings";
import { parseRoomRankingQuery, rankingError } from "@/lib/room-ranking-contract";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request, { syncVip: false });
    if (isRateLimited(`room-ranking:${user.id}`, { limit: 120, windowMs: 60000 })) throw rankingError("RATE_LIMITED", "Wait before refreshing rankings.", 429);
    const { roomId } = await params;
    const data = await getRoomRankings({ roomId, user, query: parseRoomRankingQuery(new URL(request.url).searchParams), origin: requestOrigin(request) });
    return mobileJson({ success: true, data });
  } catch (e) {
    if (e.status && e.code) return mobileJson({ success: false, error: { code: e.code, message: e.message } }, e.status);
    if (["P2021", "P2022"].includes(e.code)) return mobileJson({ success: false, error: { code: "RANKINGS_UNAVAILABLE", message: "Room rankings require the latest server migration." } }, 503);
    console.error("Room rankings failed", e);
    return mobileApiError(e, "ROOM_RANKINGS_FAILED");
  }
}
