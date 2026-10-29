import { afterEach, expect, it, vi } from "vitest";
vi.mock("./progression.js", () => ({ jsonSafe: value => value }));
vi.mock("./gift-refunds.js", () => ({ recordGiftRecovery: vi.fn() }));
import { runGiftOperation, isRetryableGiftConflict, giftOperation, giftContentionKeys } from "./gift-operation.js";
import { captureGiftEvent, giftEventTiming, rememberGiftRecovery } from "./gift-outbox-context.js";
import { recordGiftRecovery } from './gift-refunds.js';
it('fingerprints backpack funding separately from paid multi sends',()=>{
 const body={giftId:'AST-1',recipientIds:['USR-A'],roomId:'ROOM-1'};
 expect(giftOperation(body,'same-key','MULTI').fingerprint).not.toBe(giftOperation({...body,bagItemId:'AST-1'},'same-key','MULTI').fingerprint);
});
it('snapshots each multi-recipient Lucky reward instead of the aggregate',async()=>{
 const db=database(()=>{});
 db.giftTransaction={findUniqueOrThrow:async({where})=>({id:where.id})};
 recordGiftRecovery.mockClear();
 await runGiftOperation('multi-recovery',{key:'multi-recovery',fingerprint:'fp'},async()=>({transactionIds:['a','b'],luckyRewardCoins:'300',recipients:[{transactionId:'a',luckyRewardCoins:'100'},{transactionId:'b',luckyRewardCoins:'200'}]}),db);
 expect(recordGiftRecovery.mock.calls.map(c=>c[2].luckyCoins)).toEqual([100n,200n]);
});
afterEach(() => { delete globalThis.portalIo; });
it('coordinates shared recipients and agencies using resolved IDs', () => {
 expect(giftContentionKeys([{id:'a',agencyId:'agency'}, {id:'b',agencyId:'agency'}, {id:'a'}])).toEqual(['a','agency:agency','b']);
});
it('starts shared-recipient snapshots after commit while unrelated sends continue', async () => {
 const db=database(()=>{}); let release, started;
 const ready=new Promise(r=>{started=r;}); const gate=new Promise(r=>{release=r;});
 const first=runGiftOperation('shared-a',{key:'a',fingerprint:'a',contentionKeys:['shared-r']},async()=>{started();await gate;return {};},db);
 await ready;
 const second=runGiftOperation('shared-b',{key:'b',fingerprint:'b',contentionKeys:['shared-r']},async()=>({done:true}),db);
 await runGiftOperation('unrelated',{key:'c',fingerprint:'c',contentionKeys:['other-r']},async()=>({}),db);
 expect(db.$transaction).toHaveBeenCalledTimes(2);
 release(); await first; await expect(second).resolves.toEqual({done:true});
 expect(db.$transaction).toHaveBeenCalledTimes(3);
});
it('handles crossed multi-recipient sends and releases every reservation on failure', async()=>{
 const db=database(()=>{}); let active=0,peak=0;
 const send=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return {};};
 await Promise.all(Array.from({length:50},(_,i)=>runGiftOperation(i%2?'cross-a':'cross-b',{key:String(i),fingerprint:String(i),contentionKeys:i%2?['cross-b','cross-c']:['cross-c','cross-a']},send,db)));
 expect(peak).toBe(1);expect(db.$transaction).toHaveBeenCalledTimes(50);
 await expect(runGiftOperation('cross-a',{key:'fail',fingerprint:'fail',contentionKeys:['cross-b']},async()=>{throw Error('rollback');},db)).rejects.toThrow('rollback');
 await runGiftOperation('cross-b',{key:'next',fingerprint:'next',contentionKeys:['cross-a']},send,db);
 expect(globalThis[Symbol.for('portal.giftSenderQueues')].size).toBe(0);
});
it('settles 250 contending sends once each without stale snapshots or extra debits on replay', async()=>{
 // Isolated optimistic transaction model: a shared-recipient revision change
 // invalidates a snapshot, as concurrent Serializable updates do in Postgres.
 let revision=0, conflicts=0, received=0n;
 const balances=new Map(Array.from({length:5},(_,i)=>[`burst-${i}`,500n]));
 const saved=new Map(); const db=database(()=>{});
 db.$transaction=async fn=>{
  const snapshot=revision, pending=new Map(), staged=new Map(balances);let credit=0n;
  const tx={giftRequest:{findUnique:async({where})=>saved.get(JSON.stringify(where.senderId_key)),create:async({data})=>({id:JSON.stringify({senderId:data.senderId,key:data.key}),...data}),update:async({where,data})=>pending.set(where.id,{fingerprint:'burst',result:data.result})},
   charge:async sender=>{if(staged.get(sender)<10n)throw Error('INSUFFICIENT_COINS');staged.set(sender,staged.get(sender)-10n);credit+=10n;await new Promise(r=>setTimeout(r,0));}};
  const result=await fn(tx);
  if(snapshot!==revision){conflicts++;throw {code:'P2034'};}
  if(pending.size){revision++;for(const [k,v] of staged)balances.set(k,v);for(const [k,v] of pending)saved.set(k,v);received+=credit;}
  return result;
 };
 const sends=Array.from({length:250},(_,i)=>({sender:`burst-${i%5}`,operation:{key:`tap-${i}`,fingerprint:'burst',contentionKeys:['burst-recipient']}}));
 const send=({sender,operation})=>runGiftOperation(sender,operation,async tx=>{await tx.charge(sender);return {accepted:true};},db);
 await Promise.all(sends.map(send));await Promise.all(sends.map(send));
 expect(conflicts).toBe(0);expect(saved.size).toBe(250);expect(received).toBe(2500n);
 expect([...balances.values()]).toEqual([0n,0n,0n,0n,0n]);
 await expect(send({sender:'burst-0',operation:{key:'overspend',fingerprint:'burst',contentionKeys:['burst-recipient']}})).rejects.toThrow('INSUFFICIENT_COINS');
 expect(saved.size).toBe(250);expect(received).toBe(2500n);
});
it('reuses same-transaction recovery inputs without rereading gift records',async()=>{
 const db=database(()=>{});const gift={id:'known-gift'},settlement={recipientDiamonds:100n};
 db.giftTransaction={findUniqueOrThrow:vi.fn()};recordGiftRecovery.mockClear();
 await runGiftOperation('cached-recovery',{key:'cached',fingerprint:'cached'},async tx=>{
  rememberGiftRecovery(tx,gift,settlement,null);return {transactionId:gift.id,luckyRewardCoins:'10'};
 },db);
 expect(db.giftTransaction.findUniqueOrThrow).not.toHaveBeenCalled();
 expect(recordGiftRecovery).toHaveBeenCalledWith(db,gift,expect.objectContaining({settlement,pk:null,luckyCoins:10n}));
});
function database(commit) {
  const db = { giftRequest: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "request" }), update: vi.fn() }, realtimeOutbox: { updateMany: vi.fn() } };
  db.$transaction = vi.fn(async fn => { const result = await fn(db); await commit(); return result; }); return db;
}
const work = async () => { captureGiftEvent({ id: "event", channel: "audio-room:r", event: "gift:received", payload: { success: true, data: {} } }); return { data: {} }; };
it("persists identical response/event deadlines and replays without extending them", async () => {
  const db = database(() => {});
  const operation = giftOperation({ comboId: "combo", roomId: "r", giftId: "g", recipientId: "receiver" }, "combo-key", "PAID");
  let eventData;
  const send = vi.fn(async () => { eventData = giftEventTiming("audio-room:r", "gift:received", {}); return { data: {} }; });
  const result = await runGiftOperation("combo-sender", operation, send, db);
  expect(result.data.comboTiming).toEqual(eventData.comboTiming);
  expect(db.giftRequest.create).toHaveBeenCalledWith({ data: { senderId: "combo-sender", key: operation.key, fingerprint: operation.fingerprint } });
  db.giftRequest.findUnique.mockResolvedValue({ fingerprint: operation.fingerprint, result });
  const retry = { ...operation, presentation: { ...operation.presentation, receivedAt: operation.presentation.receivedAt + 60000 } };
  expect(await runGiftOperation("combo-sender", retry, send, db)).toEqual(result);
  expect(send).toHaveBeenCalledOnce();
});
it("does not hold other senders behind a sender's request queue", async () => {
  const db = database(() => {});
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = runGiftOperation("sender-a", { key: "a", fingerprint: "a" }, async () => { await pending; return {}; }, db);
  try {
    await expect(runGiftOperation("sender-b", { key: "b", fingerprint: "b" }, async () => ({ done: true }), db)).resolves.toEqual({ done: true });
  } finally { release(); await first; }
});
it("keeps the original timer on transaction retries and delayed processing", async () => {
  let attempts = 0;
  const db = database(() => { if (++attempts === 1) throw { code: "P2034" }; });
  const operation = giftOperation({ comboId: "retry-combo", roomId: "r", giftId: "g", recipientId: "receiver" }, "retry-combo-key", "PAID");
  operation.presentation.receivedAt = 0;
  const observed = [];
  const result = await runGiftOperation("retry-combo-sender", operation, async () => {
    observed.push(giftEventTiming("audio-room:r", "gift:received", {}).comboTiming);
    return { data: {} };
  }, db);
  expect(observed).toHaveLength(2);
  expect(observed[0]).toEqual(observed[1]);
  expect(result.data.comboTiming.expiresAt).toBe("1970-01-01T00:00:03.000Z");
});
it("queues simultaneous sender transactions and releases the queue after failure", async () => {
  let active=0,peak=0;
  const db=database(()=>{});
  const operation={key:"queue-test",fingerprint:"fp"};
  const slow=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;return {data:{}};};
  await Promise.all(Array.from({length:4},()=>runGiftOperation("queue-sender",operation,slow,db)));
  expect(peak).toBe(1);
  await expect(runGiftOperation("queue-sender",operation,async()=>{throw Error("rejected");},db)).rejects.toThrow("rejected");
  await expect(runGiftOperation("queue-sender",operation,slow,db)).resolves.toEqual({data:{}});
});
it("keeps a committed response successful when immediate delivery throws", async () => {
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  globalThis.portalIo={to:()=>{throw Error("socket unavailable");}};
  const db=database(()=>{});
  await expect(runGiftOperation("delivery-sender",{key:"delivery-key",fingerprint:"fp"},work,db)).resolves.toEqual({data:{}});
  expect(db.$transaction).toHaveBeenCalledOnce();
  log.mockRestore();
});
it("emits only after commit and never for a rolled-back transaction", async () => {
  let committed = false;
  const emit = vi.fn(() => expect(committed).toBe(true)); globalThis.portalIo = { to: () => ({ emit }) };
  const db = database(() => { committed = true; });
  await runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db); expect(emit).toHaveBeenCalledOnce();
  emit.mockClear(); const broken = database(() => { throw Error("rollback"); });
  await expect(runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, broken)).rejects.toThrow("rollback");
  expect(emit).not.toHaveBeenCalled();
});
it("does not resend a replay or capture events from a serialization retry", async () => {
  const emit = vi.fn(); globalThis.portalIo = { to: () => ({ emit }) };
  let attempts = 0; const db = database(() => { if (++attempts === 1) throw Object.assign(Error("retry"), { code: "P2034" }); });
  await runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db); expect(emit).toHaveBeenCalledOnce();
  db.giftRequest.findUnique.mockResolvedValue({ fingerprint: "fp", result: { data: {} } });
  await runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db); expect(emit).toHaveBeenCalledOnce();
});

const conflicts = [
  { code: "P2010", meta: { code: "40001" } },
  { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001", kind: "TransactionWriteConflict" } } } },
  { code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } } },
  { code: "P2010", meta: { code: "40P01" } },
];
it.each(conflicts)("retries aborted raw-query conflicts with one committed charge and event: %j", async conflict => {
  let balance = 100, attempts = 0, saved = null;
  const emit = vi.fn(); globalThis.portalIo = { to: () => ({ emit }) };
  const db = database(() => {});
  db.$transaction = vi.fn(async (fn, options) => {
    expect(options.isolationLevel).toBe("Serializable");
    const tx = { ...db, giftRequest: {
      findUnique: async () => saved,
      create: async () => ({ id: "request" }),
      update: async () => {},
    }, balance };
    const result = await fn(tx);
    if (++attempts === 1) throw conflict;
    balance = tx.balance;
    saved = { fingerprint: "fp", result };
    return result;
  });
  const charge = vi.fn(async tx => { tx.balance -= 10; await work(); return { data: { balance: tx.balance } }; });
  const operation = { key: "same-key", fingerprint: "fp" };
  const result = await runGiftOperation("sender", operation, charge, db);
  expect(balance).toBe(90);
  expect(charge).toHaveBeenCalledTimes(2);
  expect(emit).toHaveBeenCalledOnce();
  expect(await runGiftOperation("sender", operation, charge, db)).toEqual(result);
  expect(balance).toBe(90);
  expect(charge).toHaveBeenCalledTimes(2);
  expect(emit).toHaveBeenCalledOnce();
  await expect(runGiftOperation("sender", { ...operation, fingerprint: "different" }, charge, db)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("stops after four conflicts without emitting", async () => {
  const emit = vi.fn(); globalThis.portalIo = { to: () => ({ emit }) };
  const db = database(() => { throw conflicts[0]; });
  await expect(runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db)).rejects.toMatchObject({code:"GIFT_RETRY_REQUIRED",cause:conflicts[0]});
  expect(db.$transaction).toHaveBeenCalledTimes(4);
  expect(emit).not.toHaveBeenCalled();
});
it.each(["P2010", "INSUFFICIENT_COINS", "FORBIDDEN", "IDEMPOTENCY_CONFLICT"])("does not retry unrelated %s errors", async code => {
  const error = { code, meta: { code: "42601" } };
  expect(isRetryableGiftConflict(error)).toBe(false);
  const db = database(() => { throw error; });
  await expect(runGiftOperation("sender", { key: "key", fingerprint: "fp" }, work, db)).rejects.toBe(error);
  expect(db.$transaction).toHaveBeenCalledOnce();
});
