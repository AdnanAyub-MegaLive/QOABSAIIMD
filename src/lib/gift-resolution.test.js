import { PGlite } from '@electric-sql/pglite';
import { expect, it, vi } from 'vitest';
vi.mock('./prisma.js', () => ({ prisma: {} }));
vi.mock('./progression.js', () => ({ jsonSafe: value => value }));
vi.mock('./gift-refunds.js', () => ({ recordGiftRecovery: vi.fn() }));
vi.mock('./realtime-outbox.js', () => ({ deliverCommittedGiftEvents: vi.fn(async () => {}) }));
import { resolveGiftRequests, resolutionKeys } from './gift-resolution.js';
import { readGiftOutcome } from './gift-outcome.js';
import { giftOperation, runGiftOperation } from './gift-operation.js';
import { comboBatchOperation } from './gift-combo-batch.js';

it('validates and deduplicates original keys without accepting sender identity from the body', () => {
  expect(resolutionKeys({requestIds:['request-1','request-1']})).toEqual(['request-1']);
  for(const requestIds of [[], ['short'], [null], Array(101).fill('request-1')])
    expect(()=>resolutionKeys({requestIds})).toThrow();
});

it('never reports terminal failure when resolution times out', async () => {
  const db={$transaction:vi.fn(async()=>{throw Object.assign(Error('timeout'),{code:'P2028'});})};
  expect(await resolveGiftRequests(db,'qa',{requestIds:['request-1']})).toMatchObject({results:[{status:'PENDING'}],retryAfterMs:1000});
});

it('preserves committed taps, fences cancelled fallback sends and keeps another sender isolated', async () => {
  const pg=new PGlite();
  try {
    await pg.exec(`CREATE TABLE requests(sender TEXT,key TEXT,fingerprint TEXT,result JSONB,"createdAt" TIMESTAMPTZ DEFAULT now(),PRIMARY KEY(sender,key));
      CREATE TABLE wallet(coins BIGINT); INSERT INTO wallet VALUES(1000);`);
    const adapter=sql=>({
      sql,
      giftRequest:{
        findUnique:async({where:{senderId_key:{senderId,key}}})=>(await sql.query('SELECT * FROM requests WHERE sender=$1 AND key=$2',[senderId,key])).rows[0],
        findMany:async({where})=>(await sql.query('SELECT * FROM requests WHERE sender=$1 AND key=ANY($2)',[where.senderId,where.key.in])).rows,
        createMany:async({data})=>{for(const row of data)await sql.query('INSERT INTO requests(sender,key,fingerprint) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[row.senderId,row.key,row.fingerprint]);},
        create:async({data})=>sql.query('INSERT INTO requests(sender,key,fingerprint,result) VALUES($1,$2,$3,$4)',[data.senderId,data.key,data.fingerprint,JSON.stringify(data.result)]),
      },
      user:{findUniqueOrThrow:async()=>({coinBalance:BigInt((await sql.query('SELECT coins FROM wallet')).rows[0].coins)})},
    });
    const db={...adapter(pg),$transaction:fn=>pg.transaction(sql=>fn(adapter(sql)))};
    const body={roomId:'ROOM-QA',giftId:'AST-QA',recipientIds:['USR-QA'],comboId:'combo-qa'};
    const tap=key=>giftOperation(body,key,'MULTI');
    const work=vi.fn(async(tx)=>{
      await tx.sql.exec('UPDATE wallet SET coins=coins-100');
      return {requestId:'tap-0001',senderCoinBalance:'900',luckyRewardCoins:'0'};
    });
    expect((await readGiftOutcome(db,'sender','tap-0002')).status).toBe('UNKNOWN');
    const committed=await runGiftOperation('sender',tap('tap-0001'),work,db);
    const input={requestIds:['batch-001','tap-0001','tap-0002'],senderId:'someone-else'};
    const resolved=await resolveGiftRequests(db,'sender',input);
    expect(resolved.results.map(r=>r.status)).toEqual(['CANCELLED','COMMITTED','CANCELLED']);
    expect(resolved.results[1].result).toEqual(committed);
    expect(await resolveGiftRequests(db,'sender',input)).toEqual(resolved);
    expect((await readGiftOutcome(db,'sender','tap-0002')).status).toBe('CANCELLED');
    expect((await readGiftOutcome(db,'another-sender','tap-0002')).status).toBe('UNKNOWN');
    // Reconnect/restart uses durable storage, not an in-memory room or queue.
    expect(await runGiftOperation('sender',tap('tap-0001'),work,db)).toEqual(committed);
    await expect(runGiftOperation('sender',tap('tap-0002'),work,db)).rejects.toMatchObject({code:'GIFT_CANCELLED'});
    const batch=comboBatchOperation({...body,tapIds:['tap-0001','tap-0002']},'batch-002');
    await expect(runGiftOperation('sender',batch,work,db)).rejects.toMatchObject({code:'GIFT_CANCELLED'});
    expect(work).toHaveBeenCalledTimes(1);
    expect((await pg.query('SELECT coins FROM wallet')).rows[0].coins).toBe(900);
    expect(await db.giftRequest.findUnique({where:{senderId_key:{senderId:'sender',key:'batch-002'}}})).toBeUndefined();
    const newThenCancelled=comboBatchOperation({...body,tapIds:['tap-0003','tap-0002']},'batch-003');
    await expect(runGiftOperation('sender',newThenCancelled,work,db)).rejects.toMatchObject({code:'GIFT_CANCELLED'});
    expect((await pg.query('SELECT coins FROM wallet')).rows[0].coins).toBe(900);
    expect(await db.giftRequest.findUnique({where:{senderId_key:{senderId:'sender',key:'tap-0003'}}})).toBeUndefined();
  } finally {await pg.close();}
},20000);

it('rolls back financial work when a cancellation wins after the send snapshot was opened', async () => {
  // Model a competing committed fence appearing after the transaction's first
  // read. PostgreSQL reports a unique conflict at the send's final insert.
  let coins=1000, fence=false, reads=0;
  const db={$transaction:async fn=>{
    const before=coins;
    try{return await fn({giftRequest:{
      findUnique:async()=>{reads++;return fence?{fingerprint:'TERMINAL:CANCELLED:v1'}:null;},
      create:async()=>{fence=true;throw Object.assign(Error('unique'),{code:'P2002'});},
    }});}catch(error){coins=before;throw error;}
  }};
  const work=vi.fn(async()=>{coins-=100;return {charged:'100'};});
  await expect(runGiftOperation('race-sender',giftOperation({},'race-key1','MULTI'),work,db)).rejects.toMatchObject({code:'GIFT_CANCELLED'});
  expect(coins).toBe(1000);
  expect(work).toHaveBeenCalledOnce();
  expect(reads).toBe(2);
});
