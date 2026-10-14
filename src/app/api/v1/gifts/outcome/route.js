import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { readGiftOutcome } from "@/lib/gift-outcome";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`gift-outcome:${user.id}`, { limit: 60, windowMs: 60000 })) return mobileJson({ success: false, error: { code: "RATE_LIMITED", message: "Please wait before checking again." } }, 429);
    return mobileJson({ success: true, data: await readGiftOutcome(prisma, user.id, new URL(request.url).searchParams.get("requestId")) });
  } catch (error) { return mobileApiError(error, "GIFT_OUTCOME_FAILED"); }
}
