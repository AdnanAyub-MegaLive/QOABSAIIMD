import { prisma } from './prisma.js';
import { ledgerData } from './wallet.js';
import { notifyAction } from './action-notifications.js';
export function nextRoomRewardDay(now=new Date()) { const day=new Date(now);day.setUTCHours(0,0,0,0);day.setUTCDate(day.getUTCDate()+1);return day; }
export function roomRewardAmount(coins,rateBps){if(coins<0n||!Number.isInteger(rateBps)||rateBps<0||rateBps>10000)throw new Error('Invalid room reward amount or percentage.');return coins*BigInt(rateBps)/10000n;}
export async function payRoomReward(id,db=prisma){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "RoomRewardPayout" WHERE id=${id} FOR UPDATE`;
  const payout=await tx.roomRewardPayout.findUnique({where:{id}});
  if(!payout||payout.status!=='PENDING')return;
  if(nextRoomRewardDay(payout.day)>new Date())throw new Error('Reward day has not finished.');
  if(payout.diamonds!==roomRewardAmount(payout.giftCoins,payout.rateBps))throw new Error('Reward snapshot requires reconciliation.');
  if(await tx.giftTransaction.count({where:{id:{in:payout.giftIds},reversedAt:{not:null}}}))throw new Error('A snapshotted gift was refunded; reconcile before paying.');
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${payout.ownerId} FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:payout.ownerId},select:{status:true,deletedAt:true}});
  const ban=await tx.ban.findFirst({where:{userId:payout.ownerId,target:'USER',revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}});
  if(!user||user.status!=='ACTIVE'||user.deletedAt||ban)throw new Error('Room owner unavailable; reward held for review.');
  const credited=await tx.user.updateMany({where:{id:payout.ownerId,hostSalaryCoinBalance:{lte:9223372036854775807n-payout.diamonds}},data:{hostSalaryCoinBalance:{increment:payout.diamonds}}});
  if(!credited.count)throw new Error('Diamond balance cannot accept this reward.');
  const day=payout.day.toISOString().slice(0,10);
  await tx.walletTransaction.create({data:ledgerData({userId:payout.ownerId,type:'BONUS',direction:'CREDIT',title:'Daily room owner reward',diamonds:payout.diamonds,referenceId:`room-reward:${payout.id}`,metadata:{roomId:payout.roomId,day,giftCoins:payout.giftCoins.toString(),rateBps:payout.rateBps,policyVersion:payout.policyVersion}})});
  await notifyAction(tx,{userId:payout.ownerId,key:`room-reward:${payout.id}`,type:'ROOM_REWARD',title:'Daily room reward received',body:`${payout.diamonds} Diamonds earned from gifting in ${payout.roomId} on ${day} (UTC).`,action:{roomId:payout.roomId,payoutId:payout.id}});
  await tx.roomRewardPayout.update({where:{id},data:{status:'PAID',paidAt:new Date(),error:null}});
  await tx.auditLog.create({data:{action:'ROOM_REWARD_PAID',category:'FINANCE',entityType:'RoomRewardPayout',entityId:id,description:`Paid ${payout.diamonds} Diamonds for ${payout.roomId} on ${day}.`}});
 },{isolationLevel:'Serializable',timeout:30000});
}
let running=false;
export async function maintainRoomRewards(db=prisma){
 if(running)return;running=true;
 try{
  // Late gift refunds never silently claw back an already-paid owner balance.
  // Surface affected payouts for explicit financial reconciliation instead.
  await db.$executeRaw`UPDATE "RoomRewardPayout" p SET status='REVIEW_PAID', error='A gift was refunded after payout. Reconcile manually; no balance adjustment has been made.'
    WHERE p.status='PAID' AND EXISTS (SELECT 1 FROM "GiftTransaction" g WHERE g.id IN (SELECT jsonb_array_elements_text(p."giftIds")) AND g."reversedAt" IS NOT NULL)`;
  const policies=await db.roomRewardPolicy.findMany({orderBy:[{effectiveFrom:'asc'},{version:'asc'}]});if(!policies.length)return;
  const latest=await db.roomRewardDay.findFirst({orderBy:{day:'desc'}});
  let day=latest?nextRoomRewardDay(latest.day):policies[0].effectiveFrom;
  for(let count=0;count<7&&nextRoomRewardDay(day)<=new Date();count++){
   const end=nextRoomRewardDay(day),policy=policies.filter(p=>p.effectiveFrom<=day).at(-1);
   await db.$transaction(async tx=>{
    // Unique day receipt and room snapshots commit together; concurrent workers retry safely.
    await tx.roomRewardDay.create({data:{day,policyVersion:policy.version}});
    if(!policy.enabled||!policy.rateBps)return;
    const rows=await tx.$queryRaw`
      SELECT r."roomId",r."ownerId",SUM(debit.coins)::bigint AS coins, json_agg(g.id) AS "giftIds"
      FROM "GiftTransaction" g JOIN "AudioRoom" r ON r."roomId"=g."roomId"
      JOIN LATERAL (SELECT SUM(w.coins) AS coins FROM "WalletTransaction" w
        WHERE w."referenceId"=g.id AND w."userId"=g."senderId" AND w.type='GIFT_SENT'
        AND w.direction='DEBIT' AND w.status='COMPLETED' AND w.coins>0) debit ON debit.coins>0
      WHERE g."createdAt">=${day} AND g."createdAt"<${end} AND g."reversedAt" IS NULL AND g."liveSessionId" IS NULL
      GROUP BY r."roomId",r."ownerId"`;
    for(const row of rows){const diamonds=roomRewardAmount(row.coins,policy.rateBps);if(!diamonds)continue;
     await tx.roomRewardPayout.create({data:{day,roomId:row.roomId,ownerId:row.ownerId,policyVersion:policy.version,rateBps:policy.rateBps,giftCoins:row.coins,giftIds:row.giftIds,diamonds}});
    }
   },{isolationLevel:'Serializable',timeout:30000});
   day=end;
  }
  for(const row of await db.roomRewardPayout.findMany({where:{status:'PENDING'},orderBy:{day:'asc'},take:100})){
   try{await payRoomReward(row.id,db);}catch(e){if(['P2034','P2002'].includes(e.code))continue;await db.roomRewardPayout.updateMany({where:{id:row.id,status:'PENDING'},data:{status:'REVIEW',error:String(e.message).slice(0,500)}});}
  }
 }finally{running=false;}
}
