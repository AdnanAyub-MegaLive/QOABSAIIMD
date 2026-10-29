import { prisma } from '@/lib/prisma';
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { requireRankingRoom } from '@/lib/room-rankings';
import { rankingError } from '@/lib/room-ranking-contract';
import { roomGiftTotalsSnapshot } from '@/lib/confirmed-realtime';
import { isRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request, { syncVip: false });
    if (isRateLimited(`room-totals:${user.id}`, { limit: 60, windowMs: 60000 })) throw rankingError('RATE_LIMITED', 'Wait before refreshing room totals.', 429);
    const { roomId } = await params;
    await requireRankingRoom(prisma, roomId, user);
    const data = await roomGiftTotalsSnapshot(prisma, roomId);
    const response = await mobileJson({ success: true, data });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    if (error.status && error.code) return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status);
    if (['P2021', 'P2022'].includes(error.code)) return mobileJson({ success: false, error: { code: 'ROOM_TOTALS_UNAVAILABLE', message: 'Room totals require the latest server migration.' } }, 503);
    return mobileApiError(error, 'ROOM_TOTALS_UNAVAILABLE');
  }
}
