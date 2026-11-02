import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { requestOrigin } from '@/lib/user-perks';
import { getRoomRocketResults } from '@/lib/room-rocket-api';
import { isRateLimited } from '@/lib/rate-limit';
export const runtime = 'nodejs';
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request, { syncVip: false });
    if (isRateLimited(`rocket-results:${user.id}`, { limit: 120, windowMs: 60000 })) return mobileJson({ success: false, error: { code: 'RATE_LIMITED', message: 'Wait before refreshing rewards.' } }, 429);
    const { roomId } = await params;
    const response = await mobileJson({ success: true, data: await getRoomRocketResults(roomId, user, new URL(request.url).searchParams, requestOrigin(request)) });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    if (error.status && error.code) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
    console.error('Room Rocket results failed', error.code ?? error.name);
    return mobileApiError(error, 'ROCKET_UNAVAILABLE');
  }
}
