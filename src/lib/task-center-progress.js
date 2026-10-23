import { metricOf } from "./task-center-config.js";

// Never accept client-supplied progress or money amounts.
export async function measuredTaskProgress(db, userId, definition, start, now) {
  const metric=metricOf(definition),config=definition.config??{},createdAt={gte:start,lte:now};
  const clamp=value=>Number(BigInt(value??0)>BigInt(definition.targetValue)?BigInt(definition.targetValue):BigInt(value??0));
  if(metric==='PLAY_FREE_GAME'){
    // Count only committed free-play receipts. Wallet games and client events
    // are intentionally not evidence for this task. Never scan before creation.
    const since=new Date(Math.max(start.getTime(),new Date(definition.createdAt??now).getTime()));
    return clamp(await db.gamePlayRound.count({where:{userId,createdAt:{gte:since,lte:now},payload:{path:['status'],equals:'settled'}}}));
  }
  if(["SEND_GIFTS","GIFT_COINS_SENT","GIFT_COINS_RECEIVED"].includes(metric)){
    let identity={senderId:userId};
    if(metric==="GIFT_COINS_RECEIVED"){
      const user=await db.user.findUnique({where:{id:userId},select:{publicId:true}});
      const talents=user?await db.talent.findMany({where:{publicId:user.publicId},select:{id:true}}):[];
      identity={OR:[{recipientUserId:userId},{recipientUserId:null,talentId:{in:talents.map(t=>t.id)}}]};
    }
    const field=metric==="SEND_GIFTS"?"quantity":"coinValue";
    const sum=await db.giftTransaction.aggregate({where:{...identity,reversedAt:null,createdAt,...(config.giftAssetId?{giftAsset:{publicId:config.giftAssetId}}:{})},_sum:{[field]:true}});
    return clamp(sum._sum[field]);
  }
  if(metric==="JOIN_AGENCY")return (await db.user.findUnique({where:{id:userId},select:{agencyId:true}}))?.agencyId?1:0;
  if(metric==="CREATE_ROOM")return Math.min(await db.audioRoom.count({where:{ownerId:userId,createdAt}}),definition.targetValue);
  if(metric==="BIND_CP")return Math.min(await db.profileRelationship.count({where:{type:"CP",status:"ACTIVE",OR:[{leftUserId:userId},{rightUserId:userId}],AND:[{OR:[{expiresAt:null},{expiresAt:{gt:now}}]}]}}),1);
  if(metric==="LIKE_POSTS")return clamp(await db.postLike.count({where:{userId,createdAt,post:{authorId:{not:userId}}}}));
  if(metric==="FOLLOW_USERS")return clamp(await db.userFollow.count({where:{followerId:userId,createdAt,followed:{status:"ACTIVE",deletedAt:null,...(config.minLevel?{progress:{some:{track:{in:["USER","CHARM"]},currentLevel:{gte:config.minLevel}}}}:{})}}}));
  if(metric==="EXCHANGE")return clamp(await db.walletTransaction.count({where:{userId,type:"DIAMOND_EXCHANGE_CREDIT",status:"COMPLETED",direction:"CREDIT",createdAt}}));
  if(metric==="RECHARGE_COUNT"||metric==="RECHARGE_COINS"){
    // Personal paid top-ups and reseller personal recharges only: no bonuses, admin adjustments or business funding.
    const where={userId,status:"COMPLETED",direction:"CREDIT",createdAt,OR:[{type:"COIN_TOP_UP"},{type:"TRANSFER_RECEIVED",metadata:{path:["wallet"],equals:"PERSONAL"}}]};
    if(metric==="RECHARGE_COUNT")return clamp(await db.walletTransaction.count({where:{...where,coins:{gte:BigInt(config.minCoins??1000)}}}));
    return clamp((await db.walletTransaction.aggregate({where,_sum:{coins:true}}))._sum.coins);
  }
  return null; // Server-recorded timers or explicit admin verification, not client counters.
}
