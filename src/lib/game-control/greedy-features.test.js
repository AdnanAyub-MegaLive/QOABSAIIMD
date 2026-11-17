import {describe,it,expect,vi} from 'vitest';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../mobile-session-state.js',()=>({assertMobileSession:vi.fn()}));
import {greedyAutoBets,greedyPayout,greedyBonus,greedyBonusReady,greedyGroups} from './greedy.mjs';
import {seededRandom} from './shared-engine.mjs';
import {resolveSharedEntry} from './shared-games.js';
import {ensureGreedyRound,creditGreedyPool} from './greedy-pool.js';
import {previewRound} from './shared-preview.js';
import {validateGame} from './rules.mjs';
const game=validateGame({id:'greedy',name:'Greedy',engine:'greedy',status:'paused',minBet:10,maxBet:10000,greedyBonusThreshold:100});
const start=Date.parse('2026-10-18T00:00:00Z');
const day={id:'greedy:test',gameId:'greedy',seed:'seed',day:new Date(start),durationMs:40000,settings:game};
describe('Greedy Auto Play and bonus settlement',()=>{
 it('selects six distinct foods and charges the denomination on each',()=>{
  for(let n=0;n<30;n++){const bets=greedyAutoBets(100,seededRandom('seed',String(n)));expect(Object.keys(bets)).toHaveLength(6);expect(Object.values(bets)).toEqual(Array(6).fill(100));}
  expect(()=>greedyAutoBets(Number.MAX_SAFE_INTEGER,()=>0)).toThrow();
 });
 it('selects only two or three distinct foods in the chosen bonus group',()=>{
  const seen=new Set();for(let n=0;n<100;n++){const result=greedyBonus(seededRandom('seed',String(n)));seen.add(result.bonus);expect([2,3]).toContain(result.winners.length);expect(new Set(result.winners).size).toBe(result.winners.length);expect(result.winners.every(f=>greedyGroups[result.bonus].includes(f))).toBe(true);}expect(seen.size).toBe(2);
 });
 it('pays every winning selection in full with exact integer rounding',()=>{
  expect(greedyPayout(game,{chicken:100,fish:100,lettuce:100},['chicken','fish'])).toBe(6000n);
  const result=resolveSharedEntry({day,roomId:'any',slot:0,amount:300n,input:{currency:'COINS',bets:{chicken:100,fish:100,lettuce:100},choice:'auto'}},{result:'chicken',winners:['chicken','fish'],bonus:'pizza'});
  expect(result).toMatchObject({payout:6000,bet:300,bonus:'pizza',winners:['chicken','fish']});
  expect(greedyPayout({...game,greedyReturns:[1.99,25,15,10,5,5,5,5]},{chicken:3},['chicken'])).toBe(5n);
 });
 it('requires positive threshold and both retained pool and fresh loss progress',()=>{
  expect(greedyBonusReady({balance:100n,progress:100n},game)).toBe(true);
  for(const pool of [{balance:-5n,progress:1000n},{balance:1000n,progress:99n}])expect(greedyBonusReady(pool,game)).toBe(false);
  expect(greedyBonusReady({balance:1000n,progress:1000n},{...game,greedyBonusThreshold:0})).toBe(false);
 });
 it('freezes one shared bonus result and carries deficits instead of capping rewards',async()=>{
  let pool={balance:100n,progress:100n};const rows=new Map();
  const tx={greedyPool:{upsert:async({update})=>{if(update.balance){pool.balance+=update.balance.increment;pool.progress+=update.progress.increment;}return pool;},update:async({data})=>Object.assign(pool,data)},greedyRound:{findUnique:async({where})=>rows.get(where.id),create:async({data})=>rows.set(data.id,data)}};
  const result=await ensureGreedyRound(tx,day,0);expect(result.bonus).toBeTruthy();expect(pool.progress).toBe(0n);
  expect(await ensureGreedyRound(tx,day,0)).toEqual(result);expect(rows.size).toBe(1);
  await creditGreedyPool(tx,{day,amount:100n},{payout:4500});expect(pool.balance).toBe(-4300n);expect(pool.progress).toBe(-4400n);
  expect((await ensureGreedyRound(tx,day,1)).bonus).toBeUndefined();
 });
 it('preview batch retries debit once, rejects partial funds and settles all spots',()=>{
  const row={id:'greedy',revision:1,settings:{...game,greedyBonusThreshold:0}},owner='greedy-autoplay-atomic';
  const state=previewRound(owner,row,{action:'shared-state'},start+1000);
  const input={action:'shared-enter',id:'auto-1',dayId:state.dayId,slot:state.slot,auto:true,amount:100};
  const entry=previewRound(owner,row,input,start+2000);expect(entry.amount).toBe('600');expect(Object.keys(entry.input.bets)).toHaveLength(6);
  expect(previewRound(owner,row,input,start+2500)).toEqual(entry);
  expect(()=>previewRound(owner,row,{...input,id:'too-much',amount:2000},start+3000)).toThrow(/refill/);
  expect(previewRound(owner,row,{action:'shared-state'},start+4000).availablePoints).toBe('9400');
  const settled=previewRound(owner,row,{action:'shared-state'},start+31000);
  expect(BigInt(settled.availablePoints)).toBe(9400n+BigInt(settled.mine.result.payout));
  expect(previewRound(owner,row,{action:'greedy-history'},start+32000).rows).toHaveLength(1);
  const ranking=previewRound(owner,row,{action:'greedy-ranking'},start+32000).rows;
  if(settled.mine.result.payout>0)expect(ranking[0].payout).toBe(String(settled.mine.result.payout));else expect(ranking).toEqual([]);
 });
});
