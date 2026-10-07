import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request), { liveId } = await params;
    const row = await prisma.videoLiveSession.findFirst({ where: { publicId: liveId, hostId: user.id } });
    if (!row) return mobileJson({ success: false, error: { code: "LIVE_NOT_FOUND", message: "Your live session was not found." } }, 404);
    return mobileJson({ success: true, data: { liveId, ruleVersion: row.liveRuleVersion, enabled: row.rewardTargetCoins > 0n, targetCoins: String(row.rewardTargetCoins), eligibleGiftCoins: String(row.eligibleGiftCoins), rewardCoins: String(row.targetRewardCoins), paid: row.targetRewardPaid } });
  } catch (e) { return mobileApiError(e, "LIVE_REWARD_STATUS_FAILED"); }
}
