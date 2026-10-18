import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { prisma } from '@/lib/prisma';
import { requestOrigin } from '@/lib/user-perks';
import { isRateLimited } from '@/lib/rate-limit';
import { rankingInput } from '@/lib/events/ranking-contract';
import { eventRankings } from '@/lib/events/ranking-data';
import { policyFor } from '@/lib/events/ranking-reward-rules';
import { rankingWindow } from '@/lib/events/ranking-contract';
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
    const policies=slug==='rankings'?[]:await prisma.rankingRewardPolicy.findMany({where:{eventSlug:slug,period:input.period}});
    const window=rankingWindow(input.period);
    const current=policyFor(policies,window.start), upcoming=policyFor(policies,window.end);
    const describe=async policy=>{
      if(!policy)return null;
      const rewards=[];
      for(const row of policy.rewards){
        const props=[];
        for(const p of row.props){const asset=await prisma.uploadAsset.findUnique({where:{id:p.assetId},select:{name:true,publicId:true,active:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true}});props.push({name:asset?.name??'Unavailable prop',days:p.days,...(asset?.active?decorationMedia(asset,requestOrigin(request)):{})});}
        const tier=row.vip?await prisma.vipTier.findUnique({where:{id:row.vip.tierId},select:{name:true}}):null;
        rewards.push({rank:row.rank,coins:row.coins,diamonds:row.diamonds,props,vip:row.vip?{name:tier?.name??'Unavailable VIP',days:row.vip.days}:null});
      }
      return {enabled:policy.enabled,effectiveFrom:policy.effectiveFrom,rewards};
    };
    return mobileJson({success:true,data:{...await eventRankings({...input,viewerId:user.id,origin:requestOrigin(request)}),rewardPolicy:await describe(current),upcomingRewardPolicy:upcoming?.id!==current?.id?await describe(upcoming):null}});
  } catch(error) { if(error.code==='VALIDATION_ERROR')return mobileJson({success:false,error:{code:error.code,message:error.message}},422);return mobileApiError(error,'EVENT_RANKINGS_FAILED'); }
}
