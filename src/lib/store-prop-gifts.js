import {randomUUID} from 'node:crypto';
import {entitlementExpiry,equippablePropCategories} from './props-store.js';
import {ledgerData} from './wallet.js';
import {notifyAction} from './action-notifications.js';
const fail=(code,message,status=422)=>{throw Object.assign(new Error(message),{code,status});};
export function propGiftInput(assetId,body){
 const recipientPublicId=typeof body?.recipientPublicId==='string'?body.recipientPublicId.trim():'';
 const requestId=body?.requestId;
 if(typeof assetId!=='string'||!/^AST-[A-Za-z0-9_-]{1,100}$/.test(assetId)||!recipientPublicId||recipientPublicId.length>100||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(requestId))fail('VALIDATION_ERROR','Provide assetId, recipientPublicId and a stable requestId (letters, numbers, hyphens or underscores).');
 return {assetId,recipientPublicId,requestId};
}
export async function giftStoreProp(db,sessionUser,assetId,body){
 const input=propGiftInput(assetId,body);
 for(let attempt=0;attempt<4;attempt++){
  try{return await db.$transaction(async tx=>{
   const sender=await tx.user.findUnique({where:{id:sessionUser.id}});
   if(!sender||sender.deletedAt||sender.status!=='ACTIVE'||sender.sessionVersion!==sessionUser.sessionVersion)fail('SESSION_REVOKED','Please sign in again.',401);
   const previous=await tx.propGift.findUnique({where:{senderUserId_requestId:{senderUserId:sender.id,requestId:input.requestId}}});
   if(previous){
    if(previous.assetPublicId!==input.assetId||previous.recipientPublicId!==input.recipientPublicId)fail('IDEMPOTENCY_CONFLICT','This requestId was already used for a different gift.',409);
    return previous.result;
   }
   const recipient=await tx.user.findUnique({where:{publicId:input.recipientPublicId}});
   if(!recipient||recipient.deletedAt||recipient.status!=='ACTIVE'||recipient.companyBdCountry)fail('RECIPIENT_NOT_FOUND','Recipient was not found.',404);
   if(recipient.id===sender.id)fail('CANNOT_GIFT_SELF','You cannot give a store prop to yourself.');
   const block=await tx.userBlock.findFirst({where:{OR:[{blockerId:sender.id,blockedId:recipient.id},{blockerId:recipient.id,blockedId:sender.id}]}});
   if(block)fail('RECIPIENT_UNAVAILABLE','This recipient is unavailable.',403);
   const asset=await tx.uploadAsset.findFirst({where:{publicId:assetId,active:true,storeVisible:true,distribution:'STORE',category:{in:[...equippablePropCategories]}}});
   if(!asset)fail('STORE_ITEM_NOT_FOUND','This prop is not available for purchase.',404);
   const now=new Date(),key={assetId_userId:{assetId:asset.id,userId:recipient.id}};
   const existing=await tx.uploadAssetAssignment.findUnique({where:key});
   if(existing&&(!existing.expiresAt||existing.expiresAt>now))fail('PROP_ALREADY_OWNED_BY_RECIPIENT','The recipient already owns this prop.',409);
   const price=asset.coinPrice??0n;
   if(price<0n)fail('STORE_ITEM_NOT_FOUND','This prop is not available for purchase.',404);
   const debit=await tx.user.updateMany({where:{id:sender.id,status:'ACTIVE',deletedAt:null,sessionVersion:sessionUser.sessionVersion,coinBalance:{gte:price}},data:{coinBalance:{decrement:price},totalSpent:{increment:price}}});
   if(!debit.count)fail('INSUFFICIENT_COINS','Please recharge. Your Coin balance is too low.',409);
   const giftId='PGF-'+randomUUID().replaceAll('-','').toUpperCase(),expiresAt=entitlementExpiry(asset,now);
   const entitlement={assignedAt:now,durationMinutes:asset.defaultGrantDurationMinutes,expiresAt,source:'GIFT',sourceReference:giftId,giftedByUserId:sender.id,purchasePrice:price};
   await tx.uploadAssetAssignment.upsert({where:key,create:{assetId:asset.id,userId:recipient.id,...entitlement},update:entitlement});
   await tx.walletTransaction.create({data:ledgerData({userId:sender.id,type:'STORE_GIFT_SENT',direction:'DEBIT',title:'Prop gift sent',description:asset.name,coins:price,referenceId:giftId,metadata:{assetId,recipientPublicId:recipient.publicId,recipientUserId:recipient.id}})});
   await tx.walletTransaction.create({data:ledgerData({userId:recipient.id,type:'STORE_GIFT_RECEIVED',direction:'CREDIT',title:'Prop gift received',description:asset.name,coins:0n,referenceId:giftId,metadata:{assetId,senderPublicId:sender.publicId,senderUserId:sender.id}})});
   const updated=await tx.user.findUniqueOrThrow({where:{id:sender.id},select:{coinBalance:true}});
   const result={giftId,assetId,recipientPublicId:recipient.publicId,price:String(price),balance:String(updated.coinBalance),expiresAt:expiresAt?.toISOString()??null,permanent:expiresAt===null};
   await tx.propGift.create({data:{publicId:giftId,senderUserId:sender.id,recipientUserId:recipient.id,recipientPublicId:input.recipientPublicId,assetPublicId:assetId,requestId:input.requestId,price,result}});
   await notifyAction(tx,{userId:recipient.id,key:giftId,type:'PROP_GIFT',title:'You received a prop',body:`${sender.name} gave you ${asset.name}`,action:{screen:'MY_PROPS',giftId,assetId}});
   await tx.realtimeOutbox.create({data:{channel:`user:${recipient.publicId}`,event:'props:granted',payload:{success:true,data:{giftId,assetId,category:asset.category,expiresAt:result.expiresAt,recipientPublicId:recipient.publicId}}}});
   await tx.auditLog.create({data:{action:'STORE_PROP_GIFTED',category:'FINANCE',entityType:'PropGift',entityId:giftId,description:'User purchased a prop for another user.',metadata:{actorPublicId:sender.publicId,actorUserId:sender.id,recipientPublicId:recipient.publicId,assetId,requestId:input.requestId,priceCoins:String(price),outcome:'SUCCESS'}}});
   return result;
  },{isolationLevel:'Serializable'});}catch(error){
   if(!['P2034','P2002'].includes(error.code))throw error;
   if(attempt===3)fail('RETRY_REQUIRED','Please retry using the same requestId.',409);
  }
 }
}
