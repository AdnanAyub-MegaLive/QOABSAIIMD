import {
  getRoomGiftRanking,
  parseRoomGiftRankingQuery,
} from "@/lib/gift-leaderboard";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request, { params }) {
  try {
    await requireMobileUser(request);
    const { roomId: rawRoomId } = await params;
    const roomId = String(rawRoomId ?? "").trim();
    const { type, page, limit, offset } = parseRoomGiftRankingQuery(
      new URL(request.url).searchParams,
    );
    const ranking = await getRoomGiftRanking(roomId, {
      type,
      offset,
      limit,
      origin: requestOrigin(request),
    });
    return mobileJson({
      success: true,
      data: { roomId, type, page, ...ranking },
    });
  } catch (error) {
    console.error("Room gift ranking failed", error);
    return mobileApiError(error, "GIFT_RANKING_FAILED");
  }
}
