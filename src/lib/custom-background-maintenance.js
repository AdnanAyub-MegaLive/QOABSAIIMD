import {prisma} from "./prisma.js";
import {notifyAction} from "./action-notifications.js";
let running=false;
export async function expirePendingCustomBackgrounds(db=prisma,now=new Date()){
 if(running)return;running=true;
 try{
  const candidates=await db.customRoomBackgroundRequest.findMany({where:{status:"PENDING",OR:[{submittedAt:{lte:new Date(+now-72*3600000)}},{user:{deletedAt:{not:null}}},{user:{status:{not:"ACTIVE"}}},{user:{bans:{some:{revokedAt:null,startsAt:{lte:now},OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}}}]},select:{publicId:true},take:100});
  for(const candidate of candidates)await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "CustomRoomBackgroundRequest" WHERE "publicId" = ${candidate.publicId} FOR UPDATE`;
   const item=await tx.customRoomBackgroundRequest.findUnique({where:{publicId:candidate.publicId},include:{user:true}});
   if(item?.status!=="PENDING")return;
   const banned=await tx.ban.findFirst({where:{userId:item.userId,revokedAt:null,startsAt:{lte:now},OR:[{expiresAt:null},{expiresAt:{gt:now}}]}});
   const overdue=+item.submittedAt<=+now-72*3600000;
   if(!overdue&&!banned&&!item.user.deletedAt&&item.user.status==="ACTIVE")return;
   const reason=overdue?"Not reviewed in time":"Account is no longer eligible";
   await tx.user.update({where:{id:item.userId},data:{coinBalance:{increment:item.coins}}});
   await tx.walletTransaction.create({data:{publicId:`WTX-${crypto.randomUUID()}`,userId:item.userId,type:"CUSTOM_BACKGROUND_REFUND",direction:"CREDIT",title:"Custom background refund",description:reason,coins:item.coins,referenceId:item.publicId}});
   await tx.customRoomBackgroundRequest.update({where:{id:item.id},data:{status:"REJECTED",reviewedAt:now,rejectionReason:reason}});
   await tx.auditLog.create({data:{action:"CUSTOM_BACKGROUND_AUTO_REJECTED",category:"CONTENT_MANAGEMENT",entityType:"CustomRoomBackgroundRequest",entityId:item.publicId,description:reason,metadata:{refundedCoins:item.coins.toString()}}});
   await notifyAction(tx,{userId:item.userId,key:`custom-background:${item.id}:reviewed`,type:"CUSTOM_BACKGROUND",title:"Background rejected",body:`${reason}. ${item.coins} coins have been refunded.`,action:{screen:"ROOM_THEME"}});
  });
 }finally{running=false;}
}
