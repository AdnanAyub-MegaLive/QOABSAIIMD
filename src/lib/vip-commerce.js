import { prisma } from "./prisma.js";
import { ledgerData } from "./wallet.js";
import { decorationMedia } from "./decoration-media.js";
import { syncProgressionProps } from "./props-store.js";
const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};

export function vipRenewalExpiry(existing,days,now=new Date()) {
  const base=existing&&!existing.revokedAt&&existing.expiresAt>now?existing.expiresAt:now;
  return new Date(base.getTime()+days*86400000);
}

// Existing VipMembership is the selected entitlement; ownership is independent.
export async function selectOwnedVip(tx,userId,owned,tier) {
  const now=new Date();
  if(!tier?.active||!owned||owned.revokedAt||owned.expiresAt<=now)fail("VIP_NOT_OWNED","Select an active, unexpired VIP.",403);
  const data={tierId:tier.id,startsAt:owned.startsAt,expiresAt:owned.expiresAt,revokedAt:null};
  await tx.vipMembership.upsert({where:{userId},create:{userId,...data},update:data});
  await tx.user.update({where:{id:userId},data:{vipLevel:tier.level}});
  await tx.uploadAssetAssignment.deleteMany({where:{userId,source:"VIP_TIER"}});
  for(const assetId of new Set(tier.assets.map(a=>a.assetId))) {
    const existing=await tx.uploadAssetAssignment.findUnique({where:{assetId_userId:{assetId,userId}}});
    if(existing&&existing.source!=="VIP_TIER"&&(!existing.expiresAt||existing.expiresAt>now))continue;
    const grant={expiresAt:owned.expiresAt,source:"VIP_TIER",sourceReference:tier.id};
    await tx.uploadAssetAssignment.upsert({where:{assetId_userId:{assetId,userId}},create:{assetId,userId,...grant},update:grant});
  }
  await syncProgressionProps(userId, tx);
}

export async function vipCatalog(userId,origin,db=prisma) {
  const [tiers,owned,selected]=await Promise.all([db.vipTier.findMany({where:{active:true},include:{assets:{include:{asset:{select:{publicId:true,name:true,active:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true}}}}},orderBy:{level:"asc"}}),db.vipOwnership.findMany({where:{userId}}),db.vipMembership.findUnique({where:{userId}})]);
  const now=new Date();
  return tiers.map(t=>{const o=owned.find(x=>x.tierId===t.id),valid=o&&!o.revokedAt&&o.expiresAt>now;return {id:t.id,name:t.name,level:t.level,validDays:t.validDays,coinPrice:t.coinPrice?.toString()??null,purchasable:t.coinPrice!=null&&t.coinPrice>0n,privileges:t.privileges,owned:Boolean(valid),expiresAt:o?.expiresAt.toISOString()??null,selected:Boolean(valid&&selected?.tierId===t.id&&!selected.revokedAt&&selected.expiresAt>now),assets:t.assets.filter(a=>a.asset.active).map(a=>({privilege:a.privilege,name:a.asset.name,...decorationMedia(a.asset,origin)}))};});
}

export async function changeVip(userId,{action,tierId,requestKey},db=prisma) {
  if(!["PURCHASE","SELECT"].includes(action)||typeof tierId!=="string"||!tierId)fail("VALIDATION_ERROR","Select a VIP and valid action.",422);
  if(action==="PURCHASE"&&!/^[A-Za-z0-9._:-]{8,128}$/.test(requestKey||""))fail("VALIDATION_ERROR","Provide an Idempotency-Key (8–128 characters).",422);
  for(let attempt=0;attempt<4;attempt++)try{return await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user=await tx.user.findUnique({where:{id:userId}});
    if(!user||user.status!=="ACTIVE"||user.deletedAt)fail("SESSION_REVOKED","Account unavailable.",401);
    if(action==="PURCHASE"){
      const old=await tx.vipPurchase.findUnique({where:{userId_requestKey:{userId,requestKey}}});
      if(old){if(old.tierId!==tierId)fail("IDEMPOTENCY_CONFLICT","This key was used for another VIP.");return old.result;}
    }
    const tier=await tx.vipTier.findUnique({where:{id:tierId},include:{assets:true}});
    if(!tier?.active)fail("VIP_UNAVAILABLE","This VIP is unavailable.",404);
    let owned=await tx.vipOwnership.findUnique({where:{userId_tierId:{userId,tierId}}});
    if(action==="PURCHASE"){
      if(tier.coinPrice==null||tier.coinPrice<=0n)fail("VIP_NOT_FOR_SALE","This VIP is available by grant only.",403);
      const debit=await tx.user.updateMany({where:{id:userId,coinBalance:{gte:tier.coinPrice}},data:{coinBalance:{decrement:tier.coinPrice}}});
      if(!debit.count)fail("INSUFFICIENT_COINS","Your Coin balance is too low.");
      const expiresAt=vipRenewalExpiry(owned,tier.validDays),startsAt=owned&&!owned.revokedAt&&owned.expiresAt>new Date()?owned.startsAt:new Date();
      owned=await tx.vipOwnership.upsert({where:{userId_tierId:{userId,tierId}},create:{userId,tierId,startsAt,expiresAt},update:{startsAt,expiresAt,revokedAt:null}});
      await tx.walletTransaction.create({data:ledgerData({userId,type:"VIP_PURCHASE",direction:"DEBIT",title:"VIP purchase",description:tier.name,coins:tier.coinPrice,referenceId:requestKey,metadata:{tierId,validDays:tier.validDays}})});
    }
    // Renew selected VIP; purchasing a different one retains the user's selection.
    const current=await tx.vipMembership.findUnique({where:{userId},include:{tier:true}});
    if(action==="SELECT"||!current||current.revokedAt||current.expiresAt<=new Date()||!current.tier.active||current.tierId===tierId)await selectOwnedVip(tx,userId,owned,tier);
    else await syncProgressionProps(userId, tx);
    const balance=await tx.user.findUnique({where:{id:userId},select:{coinBalance:true}});
    const result={tierId,expiresAt:owned.expiresAt.toISOString(),coinBalance:balance.coinBalance.toString()};
    if(action==="PURCHASE")await tx.vipPurchase.create({data:{userId,requestKey,tierId,result}});
    await tx.auditLog.create({data:{action:`VIP_${action}`,category:"USER_MANAGEMENT",entityType:"User",entityId:userId,description:`VIP ${action.toLowerCase()}`,metadata:{tierId,requestKey:requestKey??null}}});
    return result;
  },{isolationLevel:"Serializable"});}catch(e){if(!["P2034","P2002"].includes(e.code)||attempt===3)throw e;}
}
