import { prisma } from '@/lib/prisma';
import { requireMobileUser, mobileApiError, mobileJson, mobileOptions, giftJson } from '@/lib/mobile-api';
import { requestOrigin } from '@/lib/user-perks';
import { newUserRewardStatus, claimNewUserReward } from '@/lib/new-user-rewards';
import { isRateLimited } from '@/lib/rate-limit';
export function OPTIONS() { return mobileOptions(); }
function failure(error) {
  if (error.status && error.code) return giftJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
  return mobileApiError(error, 'NEW_USER_REWARDS_FAILED');
}
export async function GET(request) {
  try {
    const identity = await requireMobileUser(request);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: identity.id }, select: { id: true, createdAt: true } });
    return mobileJson({ success: true, data: await newUserRewardStatus(prisma, user, requestOrigin(request)) });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    const identity = await requireMobileUser(request);
    if (isRateLimited(`new-user-rewards:${identity.id}`, { limit: 30, windowMs: 60000 })) return giftJson({ success: false, error: { code: 'RATE_LIMITED', message: 'Please wait before trying again.' } }, 429);
    const body = await request.json().catch(() => null);
    // No media enrichment/database query after a committed claim.
    return giftJson({ success: true, data: await claimNewUserReward(prisma, identity, body?.day) });
  } catch (error) { return failure(error); }
}
