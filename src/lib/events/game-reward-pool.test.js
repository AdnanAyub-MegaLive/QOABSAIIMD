import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {Prisma} from '@prisma/client';
import {gameRewardCoins,gameRewardPool} from './game-reward-pool.js';
import {rewardInput} from './ranking-reward-rules.js';
it('computes the three percentages with exact integer arithmetic',()=>{
 expect([5,3,2].map(rate=>gameRewardCoins('100000000',rate))).toEqual([50000n,30000n,20000n]);
 expect(gameRewardCoins('1999',5)).toBe(0n);
 expect(gameRewardCoins('9999999999999999999',5)).toBe(4999999999999999n);
});
it('restricts percentage policies to weekly games and prevents ambiguous fixed amounts',()=>{
 const x={track:'game',period:'week',enabled:true,rewards:[{rank:1,coinRateBps:5,coins:'0',props:[]}]};
 expect(rewardInput(x).rewards[0].coinRateBps).toBe(5);
 for(const change of [{track:'wealth'},{period:'today'},{rewards:[{rank:1,coinRateBps:.05}]},{rewards:[{rank:1,coinRateBps:5,coins:'100'}]}])expect(()=>rewardInput({...x,...change})).toThrow();
});
it('sums all settled coin stakes in a half-open week, excluding practice, cancelled and pending',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`CREATE TABLE "SharedGameEntry"(amount bigint,status text,input jsonb,"settledAt" timestamp);
 INSERT INTO "SharedGameEntry" VALUES
 (100000,'SETTLED','{"currency":"COINS"}','2026-11-09'),
 (200000,'SETTLED','{"currency":"COINS"}','2026-11-15'),
 (999999,'PENDING','{"currency":"COINS"}','2026-11-10'),
 (999999,'CANCELLED','{"currency":"COINS"}','2026-11-10'),
 (999999,'SETTLED','{"currency":"PLAY_POINTS"}','2026-11-10'),
 (999999,'SETTLED','{"currency":"COINS"}','2026-11-16');`);
 const db={$queryRaw:async(strings,...values)=>{const q=Prisma.sql(strings,...values);return (await pg.query(q.text,q.values)).rows;}};
 expect(await gameRewardPool(db,{start:new Date('2026-11-09'),end:new Date('2026-11-16')})).toBe(300000n);
 }finally{await pg.close();}
});
