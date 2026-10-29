import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { jsonSafe, appendOutbox } from "./progression.js";
import { reverseGiftXp } from "./gift-xp-reversal.js";
import { ledgerData } from "./wallet.js";
import { getRoomGiftLeaderboard } from "./gift-leaderboard.js";

const error = (message, status=409) => Object.assign(new Error(message), {status});

// Capture original effects inside the send transaction, never infer past prices.
export async function recordGiftRecovery(tx, gift, {source, luckyCoins=0n, rewardAssetId=null, live=false, settlement:knownSettlement, pk:knownPk} = {}) {
  const settlement = knownSettlement ?? await tx.giftSettlement.findUnique({where:{giftTransactionId:gift.id}});
  const pk = knownPk !== undefined ? knownPk : gift.roomId ? await tx.audioRoomPkSession.findFirst({where:{status:"LIVE",OR:[{leftRoom:{roomId:gift.roomId}},{rightRoom:{roomId:gift.roomId}}]},select:{id:true}}) : null;
  await tx.giftRecoverySnapshot.create({data:{giftId:gift.id,data:jsonSafe({version:1,source,senderId:gift.senderId,recipientId:gift.recipientUserId,
    coins:gift.coinValue,diamonds:settlement?.recipientDiamonds,agencyId:settlement?.agencyId,agencyCoins:settlement?.agencyCoins,
    giftAssetId:gift.giftAssetId,quantity:gift.quantity,talentId:gift.talentId,luckyCoins,rewardAssetId,
    manualReason:live?"Live session rewards and PK consequences require manual review.":pk?"Gift contributed to PK; outcome requires manual review.":null})}});
}

export async function previewGiftRefund(giftId, db=prisma) {
  const [gift,snapshot,existing] = await Promise.all([
    db.giftTransaction.findUnique({where:{id:giftId}}),db.giftRecoverySnapshot.findUnique({where:{giftId}}),db.giftRefund.findUnique({where:{giftId}}),
  ]);
  if(!gift)throw error("Gift not found.",404);
  const plan=snapshot?.data??null;
  const claimedReward=await db.dailyTaskInstance.findFirst({where:{userId:{in:[gift.senderId,gift.recipientUserId].filter(Boolean)},claimedAt:{gte:gift.createdAt},definition:{OR:[{type:{in:["SEND_GIFTS","TOP_SUPPORTER"]}},{metric:{in:["SEND_GIFTS","GIFT_COINS_SENT","GIFT_COINS_RECEIVED","COMPLETE_TASKS"]}}]}},select:{id:true}});
  const hash=createHash("sha256").update(JSON.stringify({giftId,plan})).digest("hex");
  return {giftId,confirmation:hash,plan,status:existing?.status??"NOT_REQUESTED",manualReason:plan?.manualReason??(!plan?"Historical gift has no recovery snapshot; explicit reconciliation approval is required.":claimedReward?"A gift-related task reward was claimed; its eligibility requires manual review.":null),alreadyReversed:Boolean(gift.reversedAt)};
}

async function recover(tx, plan, giftId) {
  const debit=async(model,id,field,amount)=>{
    amount=BigInt(amount??0);
    if(!amount)return;
    const changed=await tx[model].updateMany({where:{id,[field]:{gte:amount}},data:{[field]:{decrement:amount}}});
    if(changed.count!==1)throw error(`Cannot recover ${field}; balance is insufficient or record is missing.`);
  };
  const ledger=async(userId, suffix, direction, coins, diamonds)=>tx.walletTransaction.create({data:ledgerData({userId,type:"REFUND",direction,title:"Gift refund recovery",coins,diamonds,referenceId:`gift-refund:${giftId}:${suffix}`})});
  // Recovery happens before refund, including self-gifts; no netting against
  // the prospective refund to conceal already-spent reward Coins.
  await debit("user",plan.recipientId,"hostSalaryCoinBalance",plan.diamonds);
  if(BigInt(plan.diamonds)>0n)await ledger(plan.recipientId,"diamonds","DEBIT",null,BigInt(plan.diamonds));
  await debit("agency",plan.agencyId,"commissionCoinBalance",plan.agencyCoins);
  await debit("user",plan.senderId,"coinBalance",plan.luckyCoins);
  if(BigInt(plan.luckyCoins)>0n)await ledger(plan.senderId,"lucky","DEBIT",BigInt(plan.luckyCoins),null);
  if(plan.rewardAssetId){
    const used=await tx.userGiftInventory.updateMany({where:{userId:plan.senderId,giftAssetId:plan.rewardAssetId,quantity:{gte:plan.quantity}},data:{quantity:{decrement:plan.quantity}}});
    if(used.count!==1)throw error("Blind-box reward items are no longer recoverable.");
  }
  if(plan.talentId)await debit("talent",plan.talentId,"totalGiftsValue",plan.coins);
  if(plan.source==="BACKPACK"){
    await tx.userGiftInventory.upsert({where:{userId_giftAssetId:{userId:plan.senderId,giftAssetId:plan.giftAssetId}},create:{userId:plan.senderId,giftAssetId:plan.giftAssetId,quantity:plan.quantity},update:{quantity:{increment:plan.quantity}}});
  } else {
    await debit("user",plan.senderId,"totalSpent",plan.coins);
    await tx.user.update({where:{id:plan.senderId},data:{coinBalance:{increment:BigInt(plan.coins)}}});
    await ledger(plan.senderId,"coins","CREDIT",BigInt(plan.coins),null);
  }
}

// Portal-only caller supplies a verified admin and a previously previewed hash.
// Never invoked automatically, and snapshot-less historical gifts cannot execute.
export async function refundGift({giftId,confirmation,reason,adminId,origin},db=prisma){
  if(typeof reason!=="string"||!reason.trim()||reason.length>500)throw error("Provide a refund reason (1–500 characters).",422);
  for(let attempt=0;attempt<4;attempt++){
    try{return await db.$transaction(async tx=>{
      const preview=await previewGiftRefund(giftId,tx);
      if(preview.confirmation!==confirmation)throw error("Preview changed. Review and confirm again.");
      const existing=await tx.giftRefund.findUnique({where:{giftId}});
      if(existing)return existing;
      if(preview.alreadyReversed)throw error("Gift was already reversed outside this refund workflow.");
      const plan=preview.plan;
      const validPlan=plan?.version===1&&["COINS","BACKPACK"].includes(plan.source)&&plan.senderId&&plan.recipientId&&Number.isSafeInteger(plan.quantity)&&plan.quantity>0&&[plan.coins,plan.diamonds,plan.agencyCoins,plan.luckyCoins].every(n=>/^\d+$/.test(String(n)))&&(plan.source!=="BACKPACK"||plan.giftAssetId);
      const manualReason=preview.manualReason??(!validPlan?"Incomplete recovery data.":null);
      const audit=async status=>tx.auditLog.create({data:{adminId,action:`GIFT_REFUND_${status}`,category:"FINANCE",entityType:"GiftTransaction",entityId:giftId,description:reason.trim()}});
      if(manualReason){
        const row=await tx.giftRefund.create({data:{giftId,status:"MANUAL_REVIEW",reason:reason.trim(),reviewReason:manualReason,adminId}});
        await audit("MANUAL_REVIEW");return row;
      }
      // Savepoint permits recovery failure to roll back ALL effects while the
      // outer transaction records a durable manual-review request.
      await tx.$executeRawUnsafe("SAVEPOINT gift_refund_recovery");
      try{
        await recover(tx,plan,giftId);
        await tx.giftTransaction.update({where:{id:giftId},data:{reversedAt:new Date()}});
        await reverseGiftXp(tx,giftId,origin);
      }catch(e){
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT gift_refund_recovery");
        if(["P2034","P2002"].includes(e.code))throw e;
        const missingRecord=["P2025","P2003"].includes(e.code);
        if(!e.status && !missingRecord && !e.message?.includes("XP ledger requires reconciliation"))throw e;
        const row=await tx.giftRefund.create({data:{giftId,status:"MANUAL_REVIEW",reason:reason.trim(),reviewReason:missingRecord?"An account or reward asset needed for recovery no longer exists.":e.message,adminId}});
        await audit("MANUAL_REVIEW");return row;
      }
      const row=await tx.giftRefund.create({data:{giftId,status:"REFUNDED",reason:reason.trim(),adminId,result:plan}});
      await audit("COMPLETED");
      const users=await tx.user.findMany({where:{id:{in:[plan.senderId,plan.recipientId]}},select:{publicId:true}});
      for(const user of users)await appendOutbox(tx,`user:${user.publicId}`,"wallet:updated",{reason:"GIFT_REFUND",transactionId:giftId});
      const gift=await tx.giftTransaction.findUnique({where:{id:giftId}});
      if(gift.roomId){
        const leaderboard=await getRoomGiftLeaderboard(gift.roomId,origin,tx);
        await appendOutbox(tx,`audio-room:${gift.roomId}`,"audio-room:gift-leaderboard",{roomId:gift.roomId,...leaderboard});
      }
      return row;
    },{isolationLevel:"Serializable",timeout:20000});}
    catch(e){if(!["P2034","P2002"].includes(e.code)||attempt===3)throw e;}
  }
}
