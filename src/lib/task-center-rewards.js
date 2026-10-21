import { validateReward } from "./task-center-config.js";
import { selectOwnedVip, vipRenewalExpiry } from "./vip-commerce.js";
import { decorationMedia } from "./decoration-media.js";
import { equippablePropCategories } from "./props-store.js";

export async function validateRewardReferences(db, rewards) {
  for(const value of rewards){
    const r=validateReward(value);
    if(r.kind==="PROP"&&!await db.uploadAsset.findFirst({where:{publicId:r.id,active:true,category:{in:[...equippablePropCategories]}}}))throw Object.assign(new Error("Choose an active equippable prop reward."),{status:422});
    if(r.kind==="VIP"&&!await db.vipTier.findFirst({where:{id:r.id,active:true}}))throw Object.assign(new Error("Choose an active VIP tier reward."),{status:422});
  }
}
export async function rewardDisplay(db, reward, origin) {
  if(reward.kind==="COINS")return reward;
  if(reward.kind==="VIP"){
    const tier=await db.vipTier.findUnique({where:{id:reward.id},select:{name:true,level:true}});
    return {...reward,name:tier?.name??"VIP",level:tier?.level??null};
  }
  const asset=await db.uploadAsset.findUnique({where:{publicId:reward.id},select:{publicId:true,name:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true}});
  return {...reward,name:asset?.name??"Prop",...(asset&&origin?decorationMedia(asset,origin):{})};
}
export async function grantTaskReward(tx,userId,reward,reference,now){
  if(reward.kind==="COINS")return BigInt(reward.coins);
  await validateRewardReferences(tx,[reward]);
  if(reward.kind==="VIP"){
    const tier=await tx.vipTier.findUnique({where:{id:reward.id},include:{assets:true}});
    const existing=await tx.vipOwnership.findUnique({where:{userId_tierId:{userId,tierId:tier.id}}});
    const expiresAt=vipRenewalExpiry(existing,reward.days,now);
    const owned=await tx.vipOwnership.upsert({where:{userId_tierId:{userId,tierId:tier.id}},create:{userId,tierId:tier.id,startsAt:now,expiresAt},update:{expiresAt,revokedAt:null}});
    const selected=await tx.vipMembership.findUnique({where:{userId}});
    if(!selected||selected.revokedAt||selected.expiresAt<=now||selected.tierId===tier.id)await selectOwnedVip(tx,userId,owned,tier);
  }else{
    const asset=await tx.uploadAsset.findUnique({where:{publicId:reward.id},select:{id:true}});
    const existing=await tx.uploadAssetAssignment.findUnique({where:{assetId_userId:{assetId:asset.id,userId}}});
    // Never replace or shorten permanent/longer ownership.
    if(existing&&!existing.expiresAt)return 0n;
    const base=existing?.expiresAt>now?existing.expiresAt:now;
    const expiresAt=new Date(base.getTime()+reward.days*86400000);
    await tx.uploadAssetAssignment.upsert({where:{assetId_userId:{assetId:asset.id,userId}},create:{assetId:asset.id,userId,expiresAt,source:"TASK",sourceReference:reference},update:{expiresAt}});
  }
  return 0n;
}
