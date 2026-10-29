import { createHash, randomUUID } from "node:crypto";
import { setTimeout as retryDelay } from "node:timers/promises";
import { prisma } from "./prisma.js";
import { jsonSafe } from "./progression.js";
import { recordGiftRecovery } from "./gift-refunds.js";
import { giftOutboxContext } from "./gift-outbox-context.js";
import { deliverCommittedGiftEvents } from "./realtime-outbox.js";
import { comboPresentation, giftComboTiming } from "./gift-combo-timing.js";
export { flushRealtimeOutbox } from "./realtime-outbox.js";
export function isRetryableGiftConflict(error) {
  if (["P2034", "P2002"].includes(error?.code)) return true;
  // P2010 also covers non-retryable SQL errors. Only retry positively identified
  // aborted serialization/deadlock transactions, including Prisma's pg adapter.
  if (error?.code !== "P2010") return false;
  const pending = [error.meta], seen = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if ([value.code, value.originalCode, value.sqlState].some(code => ["40001", "40P01"].includes(code)) || value.kind === "TransactionWriteConflict") return true;
    pending.push(value.cause, value.driverAdapterError);
  }
  return false;
}
export function giftOperation(body, key, mode) {
  if(key!=null&&!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw Object.assign(new Error("Use an 8–128 character Idempotency-Key."),{code:"VALIDATION_ERROR"});
  const fields={mode,recipientId:body?.recipientId??null,recipientIds:Array.isArray(body?.recipientIds)?[...new Set(body.recipientIds)].sort():null,giftId:body?.giftId??null,roomId:body?.roomId??null,liveId:body?.liveId??null,quantity:Number(body?.quantity??1),giftBatchId:body?.giftBatchId??null,comboId:body?.comboId??null};
  if(body?.conversationId){fields.conversationId=body.conversationId;fields.clientMessageId=body.clientMessageId??null;}
  if(body?.bagItemId != null) fields.bagItemId = body.bagItemId;
  return {key:key??`server-${randomUUID()}`,fingerprint:createHash("sha256").update(JSON.stringify(fields)).digest("hex"),presentation:comboPresentation(body,mode)};
}
export async function priorGiftOperation(senderId, operation, db=prisma) {
  const previous=await db.giftRequest.findUnique({where:{senderId_key:{senderId,key:operation.key}}});
  if(previous&&previous.fingerprint!==operation.fingerprint) throw Object.assign(new Error("This idempotency key was used with a different request."),{code:"IDEMPOTENCY_CONFLICT"});
  return previous?.result??null;
}
export async function runGiftOperation(senderId,operation,work,db=prisma) {
  // Avoid conflicting snapshots for simultaneous taps from the same sender.
  // This is process-local scheduling only; Serializable and conditional debits
  // remain authoritative across processes and for different senders.
  const queues = globalThis[Symbol.for("portal.giftSenderQueues")] ??= new Map();
  const previous = queues.get(senderId) ?? Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  queues.set(senderId, tail);
  await previous;
  try { return await executeGiftOperation(senderId, operation, work, db); }
  finally { release(); if (queues.get(senderId) === tail) queues.delete(senderId); }
}
async function executeGiftOperation(senderId,operation,work,db) {
  for(let attempt=0;attempt<4;attempt++) try {
    const events = [];
    events.comboTiming = giftComboTiming(operation.presentation, senderId);
    const committed = await giftOutboxContext.run(events, () => db.$transaction(async tx=>{
      const old=await priorGiftOperation(senderId,operation,tx); if(old) return old;
      const request=await tx.giftRequest.create({data:{senderId,key:operation.key,fingerprint:operation.fingerprint}});
      const result=jsonSafe(await work(tx));
      const payload=result.data??result;
      if (events.comboTiming) payload.comboTiming = events.comboTiming;
      const giftIds=payload.transactionIds??(payload.transactionId?[payload.transactionId]:[]);
      for(const id of giftIds){
        const cached=events.recoveryInputs?.get(id);
        const known=cached?.tx===tx?cached:null;
        const gift=known?.gift??await tx.giftTransaction.findUniqueOrThrow({where:{id}});
        const reward=payload.revealedGift?.publicId?await tx.uploadAsset.findUnique({where:{publicId:payload.revealedGift.publicId},select:{id:true}}):null;
        const recipientResult = payload.recipients?.find(row => row.transactionId === id);
        await recordGiftRecovery(tx,gift,{source:payload.source==="BACKPACK"?"BACKPACK":"COINS",luckyCoins:BigInt(recipientResult?.luckyRewardCoins??payload.luckyRewardCoins??0),rewardAssetId:reward?.id??null,live:Boolean(gift.liveSessionId),settlement:known?.settlement,pk:known?.pk});
      }
      await tx.giftRequest.update({where:{id:request.id},data:{result}});
      return result;
    },{isolationLevel:"Serializable",timeout:20000}));
    // Only after commit, outside the transaction retry block's awaited work.
    // Delivery failure must never retry a committed charge or fail its response.
    void Promise.resolve().then(() => deliverCommittedGiftEvents(events, globalThis.portalIo, db)).catch(error => console.error("Immediate gift delivery failed", error?.message));
    return committed;
  } catch(error) {
    if (!isRetryableGiftConflict(error)) throw error;
    if (attempt === 3) throw Object.assign(new Error("Gift is busy. Retry with the same request ID."), { code: "GIFT_RETRY_REQUIRED", cause: error });
    // Wait outside the rolled-back transaction; stagger competing combo taps.
    await retryDelay(25 * 2 ** attempt + Math.floor(Math.random() * 25));
  }
}
