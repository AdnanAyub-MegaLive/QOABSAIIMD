import { calendarWindow } from '@/lib/business-time.js';
import { mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { prisma } from '@/lib/prisma';
import { requestOrigin } from '@/lib/user-perks';
import { rankingInput } from '@/lib/events/ranking-contract';
import { describeRankingRewardPolicy } from '@/lib/events/ranking-reward-display';
import { policyFor } from '@/lib/events/ranking-reward-rules';
import { configuredRankingWindow } from '@/lib/events/ranking-contract';
export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
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
    const current=policyFor(policies,window.start), upcoming=policyFor(policies,window.end);
    const describe=policy=>describeRankingRewardPolicy(prisma,policy,requestOrigin(request));
    return mobileJson({success:true,data:{rewardPolicy:await describe(current),upcomingRewardPolicy:upcoming?.id!==current?.id?await describe(upcoming):null}});
  } catch(error) { if(error.code==='VALIDATION_ERROR')return mobileJson({success:false,error:{code:error.code,message:error.message}},422);return mobileApiError(error,'EVENT_RANKINGS_FAILED'); }
}
