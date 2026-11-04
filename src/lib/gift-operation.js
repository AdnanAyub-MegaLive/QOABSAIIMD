import { createHash, randomUUID } from "node:crypto";
import { CANCELLED_GIFT_FINGERPRINT } from './gift-request-state.js';
import { setTimeout as retryDelay } from "node:timers/promises";
import { prisma } from "./prisma.js";
import { jsonSafe } from "./progression.js";
import { recordGiftRecovery } from "./gift-refunds.js";
import { enqueueRocketGift } from "./room-rocket.js";
import { giftOutboxContext } from "./gift-outbox-context.js";
import { deliverCommittedGiftEvents } from "./realtime-outbox.js";
import { comboPresentation, giftComboTiming } from "./gift-combo-timing.js";
import { realtimeTiming } from './realtime-timing.js';
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
  if(previous?.fingerprint===CANCELLED_GIFT_FINGERPRINT) throw Object.assign(new Error('This gift request was cancelled. It will not be charged.'),{code:'GIFT_CANCELLED'});
  if(previous&&previous.fingerprint!==operation.fingerprint) throw Object.assign(new Error("This idempotency key was used with a different request."),{code:"IDEMPOTENCY_CONFLICT"});
  return previous?.result??null;
}
export async function runGiftOperation(senderId,operation,work,db=prisma) {
  const timing = realtimeTiming('gift', operation.key);
  timing('operation_received');
  // A sender waiting for their own earlier request must not reserve the pool.
  return withGiftGate(`sender:${senderId}`, () => {
    const execute = () => executeGiftOperation(senderId, operation, work, db, timing);
    const keys = [...new Set(operation.contentionKeys ?? [])].sort();
    const enter = index => index === keys.length ? execute() : withGiftGate(keys[index], () => enter(index + 1));
    return enter(0);
  });
}
async function withGiftGate(key, work) {
  const queues = globalThis[Symbol.for("portal.giftSenderQueues")] ??= new Map();
  const previous = queues.get(key);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  queues.set(key, gate);
  await previous;
  try { return await work(); }
  finally {
    release();
    if (queues.get(key) === gate) queues.delete(key);
  }
}
export function giftContentionKeys(recipients, { lucky = false } = {}) {
  // Lucky sends never reserve a recipient. Normal sends sharing a hot row
  // avoid repeatedly aborting one another's Serializable snapshots.
  return lucky ? ['pool:lucky:GLOBAL'] : [...new Set(recipients.map(user => `recipient:${user.id}`))];
}
async function executeGiftOperation(senderId,operation,work,db,timing) {
  timing('queued_operation_started');
  for(let attempt=0;attempt<4;attempt++) try {
    const events = [];
    events.comboTiming = giftComboTiming(operation.presentation, senderId);
    const committed = await giftOutboxContext.run(events, () => db.$transaction(async tx=>{
      timing('transaction_started');
      if (!operation.taps) return settleOperation(tx, senderId, operation, work, events);
      const old = await priorGiftOperation(senderId, operation, tx);
      if (old) return old;
      const taps = [];
      for (const tap of operation.taps) {
        events.comboTiming = giftComboTiming(tap.presentation, senderId);
        const result = await settleOperation(tx, senderId, tap, inner => work(inner, tap), events);
        taps.push({ tapId: tap.key, result });
      }
      await operation.finalize?.(tx);
      const balance = await tx.user.findUniqueOrThrow({ where: { id: senderId }, select: { coinBalance: true } });
      const result = { requestId: operation.key, taps, senderCoinBalance: balance.coinBalance.toString() };
      await tx.giftRequest.create({ data: { senderId, key: operation.key, fingerprint: operation.fingerprint, result } });
      return result;
    },{isolationLevel:"Serializable",timeout:20000}));
    timing('transaction_committed');
    if (events.queryTimings) {
      try { console.info('Gift query timing', JSON.stringify(events.queryTimings)); } catch { /* diagnostics only */ }
    }
    // Only after commit, outside the transaction retry block's awaited work.
    // Delivery failure must never retry a committed charge or fail its response.
    void Promise.resolve().then(() => deliverCommittedGiftEvents(events, globalThis.portalIo, db)).catch(error => console.error("Immediate gift delivery failed", error?.message));
    return committed;
  } catch(error) {
    if (!isRetryableGiftConflict(error)) throw error;
    timing(`transaction_conflict_${attempt + 1}`);
    if (attempt === 3) throw Object.assign(new Error("Gift is busy. Retry with the same request ID."), { code: "GIFT_RETRY_REQUIRED", cause: error });
    // Wait outside the rolled-back transaction; stagger competing combo taps.
    await retryDelay(25 * 2 ** attempt + Math.floor(Math.random() * 25));
  }
}

async function settleOperation(tx, senderId, operation, work, events) {
  const old=await priorGiftOperation(senderId,operation,tx); if(old) return old;
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
    await recordGiftRecovery(tx,gift,{source:payload.source==="BACKPACK"?"BACKPACK":"COINS",luckyCoins:BigInt(recipientResult?.luckyRewardCoins??payload.luckyRewardCoins??0),rewardAssetId:reward?.id??null,live:Boolean(gift.liveSessionId),settlement:known?.settlement,pk:known?.pk,announcementRecipients:giftIds.length>1?{firstGiftId:giftIds[0],count:giftIds.length}:null});
    await enqueueRocketGift(tx, gift, payload.source === 'BACKPACK' ? 'BACKPACK' : 'COINS');
  }
  // A pending row was never visible outside this transaction. Insert its
  // completed result once instead of INSERT then UPDATE. The unique key
  // still rolls back a competing transaction before any effects commit.
  await tx.giftRequest.create({data:{senderId,key:operation.key,fingerprint:operation.fingerprint,result}});
  return result;
}
