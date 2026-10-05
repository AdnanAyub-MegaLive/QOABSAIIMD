import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { jsonSafe } from "./progression.js";
export function giftOperation(body, key, mode) {
  if(key!=null&&!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw Object.assign(new Error("Use an 8–128 character Idempotency-Key."),{code:"VALIDATION_ERROR"});
  const fields={mode,recipientId:body?.recipientId??null,recipientIds:Array.isArray(body?.recipientIds)?[...new Set(body.recipientIds)].sort():null,giftId:body?.giftId??null,roomId:body?.roomId??null,liveId:body?.liveId??null,quantity:Number(body?.quantity??1),giftBatchId:body?.giftBatchId??null,comboId:body?.comboId??null};
  return {key:key??`server-${randomUUID()}`,fingerprint:createHash("sha256").update(JSON.stringify(fields)).digest("hex")};
}
export async function priorGiftOperation(senderId, operation, db=prisma) {
  const previous=await db.giftRequest.findUnique({where:{senderId_key:{senderId,key:operation.key}}});
  if(previous&&previous.fingerprint!==operation.fingerprint) throw Object.assign(new Error("This idempotency key was used with a different request."),{code:"IDEMPOTENCY_CONFLICT"});
  return previous?.result??null;
}
export async function runGiftOperation(senderId,operation,work,db=prisma) {
  for(let attempt=0;attempt<4;attempt++) try {
    return await db.$transaction(async tx=>{
      const old=await priorGiftOperation(senderId,operation,tx); if(old) return old;
      const request=await tx.giftRequest.create({data:{senderId,...operation}});
      const result=jsonSafe(await work(tx));
      await tx.giftRequest.update({where:{id:request.id},data:{result}});
      return result;
    },{isolationLevel:"Serializable",timeout:20000});
  } catch(error) { if(!["P2034","P2002"].includes(error.code)||attempt===3) throw error; }
}

let flushing=false;
export async function flushRealtimeOutbox(io=globalThis.portalIo,db=prisma) {
  if(!io||flushing)return; flushing=true;
  try {
    const rows=await db.realtimeOutbox.findMany({where:{deliveredAt:null},orderBy:[{createdAt:"asc"},{id:"asc"}],take:100});
    for(const row of rows) {
      try {
        io.to(row.channel).emit(row.event,{...row.payload,data:{...row.payload.data,eventId:row.id}});
        await db.realtimeOutbox.update({where:{id:row.id},data:{deliveredAt:new Date(),attempts:{increment:1}}});
      } catch(error) { await db.realtimeOutbox.update({where:{id:row.id},data:{attempts:{increment:1}}}); console.error("Realtime outbox delivery failed",row.id,error.message); }
    }
  } finally { flushing=false; }
}
