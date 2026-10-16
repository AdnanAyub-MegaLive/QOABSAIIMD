import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { prisma } from '@/lib/prisma';
import { requestOrigin } from '@/lib/user-perks';
import { isRateLimited } from '@/lib/rate-limit';
import { rankingInput } from '@/lib/events/ranking-contract';
import { eventRankings } from '@/lib/events/ranking-data';
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`event-rankings:${user.id}`, { limit: 60, windowMs: 60000 })) return mobileJson({ success:false,error:{code:'RATE_LIMITED',message:'Please wait a moment before refreshing.'} },429);
    const event = await prisma.event.findUnique({ where: { slug: 'rankings' }, select: { status: true } });
    if (event?.status !== 'PUBLISHED') return mobileJson({success:false,error:{code:'EVENT_UNAVAILABLE',message:'The ranking event is not currently published.'}},404);
    const input = rankingInput(new URL(request.url).searchParams);
    return mobileJson({success:true,data:await eventRankings({...input,viewerId:user.id,origin:requestOrigin(request)})});
  } catch(error) { if(error.code==='VALIDATION_ERROR')return mobileJson({success:false,error:{code:error.code,message:error.message}},422);return mobileApiError(error,'EVENT_RANKINGS_FAILED'); }
}
