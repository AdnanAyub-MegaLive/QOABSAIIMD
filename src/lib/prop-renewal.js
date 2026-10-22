import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ledgerData } from './wallet.js';
import { retryableConflict } from './special-id-commerce.js';
const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};
export async function renewProp(db,userId,assetId,requestKey){
 if(!/^[A-Za-z0-9._:-]{8,128}$/.test(requestKey||''))fail('VALIDATION_ERROR','Provide an Idempotency-Key of 8–128 characters.',422);
 for(let attempt=0;attempt<4;attempt++)try{
  return await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
   const user=await tx.user.findUnique({where:{id:userId}});
   if(!user||user.deletedAt||user.status!=='ACTIVE')fail('SESSION_REVOKED','Account unavailable.',401);
   const replay=await tx.propPurchase.findUnique({where:{userId_requestKey:{userId,requestKey}}});
   if(replay){if(replay.assetPublicId!==assetId||replay.kind!=='RENEWAL')fail('IDEMPOTENCY_CONFLICT','This key belongs to another purchase.');return replay.result;}
   const asset=await tx.uploadAsset.findFirst({where:{publicId:assetId,active:true,archivedAt:null,storeVisible:true,distribution:'STORE'}});
   if(!asset)fail('STORE_ITEM_NOT_FOUND','Store item is unavailable.',404);
   const where={assetId_userId:{assetId:asset.id,userId}};
   const owned=await tx.uploadAssetAssignment.findUnique({where});
   if(!owned)fail('NOT_OWNED','Purchase this item before renewing it.');
   const minutes=asset.defaultGrantDurationMinutes;
   if(!owned.expiresAt||!Number.isSafeInteger(minutes)||minutes<=0)fail('NOT_RENEWABLE','Only timed properties can be renewed.');
   const now=new Date(),expiresAt=new Date(Math.max(now.getTime(),owned.expiresAt.getTime())+minutes*60000);
   if(!Number.isFinite(expiresAt.getTime()))fail('NOT_RENEWABLE','Invalid renewal duration.');
   const price=asset.coinPrice??0n;
   if(price<0n)fail('VALIDATION_ERROR','Invalid item price.',422);
   const debit=await tx.user.updateMany({where:{id:userId,coinBalance:{gte:price}},data:{coinBalance:{decrement:price},totalSpent:{increment:price}}});
   if(!debit.count)fail('INSUFFICIENT_COINS','Your Coin balance is too low.',402);
   await tx.uploadAssetAssignment.update({where,data:{expiresAt,durationMinutes:minutes,renewedAt:now}});
   const purchaseId=`PUR-${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`;
   const result={assetId,purchaseId,expiresAt:expiresAt.toISOString(),addedDays:minutes/1440,price:price.toString(),coinBalance:(user.coinBalance-price).toString()};
   await tx.propPurchase.create({data:{publicId:purchaseId,userId,assetId:asset.id,assetPublicId:assetId,assetName:asset.name,price,kind:'RENEWAL',requestKey,result}});
   await tx.walletTransaction.create({data:ledgerData({userId,type:'STORE_PURCHASE',direction:'DEBIT',title:'Store property renewal',coins:price,referenceId:purchaseId,metadata:{assetId,kind:'RENEWAL'}})});
   await tx.auditLog.create({data:{action:'STORE_PROP_RENEWED',category:'FINANCE',entityType:'PropPurchase',entityId:purchaseId,description:'User renewed a store property.',metadata:{userId,...result}}});
   return result;
  },{isolationLevel:'Serializable'});
 }catch(error){if(!retryableConflict(error))throw error;if(attempt===3)fail('RENEWAL_BUSY','Another operation is in progress. Retry with the same Idempotency-Key.');await delay(25*2**attempt);}
}
