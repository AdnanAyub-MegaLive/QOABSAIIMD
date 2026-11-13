import { decorationMedia } from '../decoration-media.js';
export async function describeRankingRewardPolicy(prisma, policy, origin) {
      if(!policy)return null;
      const rewards=[];
      for(const row of policy.rewards){
        const props=[];
        for(const p of row.props){const asset=await prisma.uploadAsset.findUnique({where:{id:p.assetId},select:{name:true,publicId:true,active:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true}});props.push({name:asset?.name??'Unavailable prop',days:p.days,...(asset?.active?decorationMedia(asset,origin):{})});}
        const tier=row.vip?await prisma.vipTier.findUnique({where:{id:row.vip.tierId},select:{name:true}}):null;
        rewards.push({rank:row.rank,coins:row.coins,diamonds:row.diamonds,props,vip:row.vip?{name:tier?.name??'Unavailable VIP',days:row.vip.days}:null});
      }
      return {enabled:policy.enabled,effectiveFrom:policy.effectiveFrom,rewards};
}
