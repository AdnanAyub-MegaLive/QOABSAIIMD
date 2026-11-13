import { calendarWindow } from '@/lib/business-time.js';
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { prisma } from '@/lib/prisma';
import { requestOrigin } from '@/lib/user-perks';
import { isRateLimited } from '@/lib/rate-limit';
import { rankingInput } from '@/lib/events/ranking-contract';
import { eventRankings } from '@/lib/events/ranking-data';
import { describeRankingRewardPolicy } from '@/lib/events/ranking-reward-display';
import { policyFor } from '@/lib/events/ranking-reward-rules';
import { configuredRankingWindow } from '@/lib/events/ranking-contract';
import { decorationMedia } from '@/lib/decoration-media';
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    if (isRateLimited(`event-rankings:${user.id}`, { limit: 60, windowMs: 60000 })) return mobileJson({ success:false,error:{code:'RATE_LIMITED',message:'Please wait a moment before refreshing.'} },429);
    const params=new URL(request.url).searchParams;
    const input = rankingInput(params);
    const slug=params.get('event')||'rankings';
    if(slug!=='rankings'&&slug!==`ranking-${input.type}`)return mobileJson({success:false,error:{code:'EVENT_UNAVAILABLE',message:'Unknown ranking event.'}},404);
    const event = await prisma.event.findUnique({ where: { slug }, select: { status: true } });
    if (event?.status !== 'PUBLISHED') return mobileJson({success:false,error:{code:'EVENT_UNAVAILABLE',message:'The ranking event is not currently published.'}},404);
    const policies=await prisma.rankingRewardPolicy.findMany({where:{eventSlug:slug==='rankings'?`ranking-${input.type}`:slug,period:input.period}});
    let when=new Date();
    if(input.type==='weekly-star' && params.get('week')==='last')when = new Date(+calendarWindow('week',when).start - 1);
    const window=await configuredRankingWindow(prisma,input.type,input.period,when);
    const weekly=input.type==='weekly-star'?await prisma.weeklyStarWeek.findUnique({where:{startsAt:window.start}}):null;
    const weeklyGifts=weekly?.giftIds.length ? await prisma.uploadAsset.findMany({where:{id:{in:weekly.giftIds}},select:{publicId:true,name:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true}}):[];
    const current=policyFor(policies,window.start), upcoming=policyFor(policies,window.end);
    const describe=policy=>describeRankingRewardPolicy(prisma,policy,requestOrigin(request));
    return mobileJson({success:true,data:{weeklyGifts:weeklyGifts.map(a=>({name:a.name,...decorationMedia(a,requestOrigin(request))})),...await eventRankings({...input,window,viewerId:user.id,origin:requestOrigin(request)}),rewardPolicy:await describe(current),upcomingRewardPolicy:upcoming?.id!==current?.id?await describe(upcoming):null}});
  } catch(error) { if(error.code==='VALIDATION_ERROR')return mobileJson({success:false,error:{code:error.code,message:error.message}},422);return mobileApiError(error,'EVENT_RANKINGS_FAILED'); }
}
