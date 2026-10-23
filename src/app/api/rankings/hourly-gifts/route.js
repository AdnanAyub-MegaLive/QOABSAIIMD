import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { requestOrigin } from "@/lib/user-perks";
import { getHourlyGiftRankings } from "@/lib/hourly-gift-rankings";
import { hourlyError } from "@/lib/hourly-gift-ranking-contract";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    const user = await requireMobileUser(request, { syncVip: false });
    if (isRateLimited(`hourly-gifts:${user.id}`, { limit: 60, windowMs: 60000 })) throw hourlyError("RATE_LIMITED", "Wait before refreshing hourly rankings.", 429);
    if ([...new URL(request.url).searchParams.keys()].length) throw hourlyError("VALIDATION_ERROR", "This endpoint uses the server's current UTC hour and accepts no query parameters.");
    return mobileJson({ success: true, data: await getHourlyGiftRankings({ user, origin: requestOrigin(request) }) });
  } catch (e) {
    if (e.status && e.code) return mobileJson({ success: false, error: { code: e.code, message: e.message } }, e.status);
    if (["P2021", "P2022"].includes(e.code)) return mobileJson({ success: false, error: { code: "HOURLY_RANKINGS_UNAVAILABLE", message: "Hourly rankings require the latest migration." } }, 503);
    console.error("Hourly gift rankings failed", e);
    return mobileApiError(e, "HOURLY_RANKINGS_FAILED");
  }
}
