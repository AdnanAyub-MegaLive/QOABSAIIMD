import { it, expect } from 'vitest';
import { serializeTransaction, serializePgTransactions } from './serialized-pg-adapter.js';
import { validationResult, unwrapAction } from './action-validation.js';
import { giftOutboxContext } from './gift-outbox-context.js';

it('collects opt-in query durations without SQL or parameters and isolates contexts',async()=>{
 const previous=process.env.REALTIME_TIMINGS;process.env.REALTIME_TIMINGS='true';
 try{
  const tx=serializeTransaction({queryRaw:async()=>42,executeRaw:async()=>{},commit:async()=>{},rollback:async()=>{}});
  const context=[];
  expect(await giftOutboxContext.run(context,()=>tx.queryRaw({sql:'SELECT "coinBalance" FROM "public"."User" WHERE id=$1',args:['secret-id']}))).toBe(42);
  expect(context.queryTimings.User.count).toBe(1);expect(context.queryTimings.User.ms).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(context.queryTimings)).not.toMatch(/secret-id|coinBalance|SELECT/);
  const next=[];await giftOutboxContext.run(next,()=>tx.queryRaw({sql:'SELECT id FROM "User"'}));
  expect(next.queryTimings.User.count).toBe(1);expect(context.queryTimings.User.count).toBe(1);
 }finally{if(previous===undefined)delete process.env.REALTIME_TIMINGS;else process.env.REALTIME_TIMINGS=previous;}
});

it('serializes concurrent queries on one transaction, preserving results', async () => {
  let active=0, peak=0;
  const query=async value=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return value;};
  const tx=serializeTransaction({queryRaw:query,executeRaw:query,commit:query,rollback:query});
  expect(await Promise.all([tx.queryRaw(1),tx.executeRaw(2)])).toEqual([1,2]);
  expect(peak).toBe(1);
});
it('preserves query errors and allows rollback after failure', async () => {
  const seen=[];
  const tx=serializeTransaction({queryRaw:async()=>{throw Error('denied');},executeRaw:async()=>{},commit:async()=>{},rollback:async()=>seen.push('rollback')});
  await expect(tx.queryRaw()).rejects.toThrow('denied');
  await tx.rollback();expect(seen).toEqual(['rollback']);
});
it('keeps isolation arguments and pooled queries unchanged',async()=>{
  const adapter={queryRaw:async()=>42,startTransaction:async isolation=>({isolation,queryRaw:async()=>{},executeRaw:async()=>{},commit:async()=>{},rollback:async()=>{}})};
  const connected=await serializePgTransactions({connect:async()=>adapter}).connect();
  expect((await connected.startTransaction('Serializable')).isolation).toBe('Serializable');
  expect(await connected.queryRaw()).toBe(42);
});
it('returns readable validation without a successful UI update',()=>{
  expect(()=>unwrapAction(validationResult('HOST_AGENCY_REQUIRED'))).toThrow('Join an agency');
  expect(()=>unwrapAction(validationResult('USER_NOT_FOUND'))).toThrow('current USR/TLN');
  expect(unwrapAction({publicId:'USR-1'})).toEqual({publicId:'USR-1'});
});
