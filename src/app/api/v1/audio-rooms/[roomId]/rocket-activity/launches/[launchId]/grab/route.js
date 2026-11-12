import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { prisma } from '@/lib/prisma';
import { requestOrigin } from '@/lib/user-perks';
import { grabRocketLaunch } from '@/lib/room-rocket';
import { isRateLimited } from '@/lib/rate-limit';
export const runtime = 'nodejs';
export function OPTIONS() { return mobileOptions(); }
export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request, { syncVip: false });
    if (isRateLimited(`rocket-grab:${user.id}`, { limit: 30, windowMs: 60000 })) return mobileJson({ success: false, error: { code: 'RATE_LIMITED', message: 'Wait before trying again.' } }, 429);
    const { roomId, launchId } = await params;
    const response = mobileJson({ success: true, data: await grabRocketLaunch(prisma, roomId, launchId, user, requestOrigin(request)) });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    if (error.status && error.code) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
    return mobileApiError(error, 'ROCKET_UNAVAILABLE');
  }
}
