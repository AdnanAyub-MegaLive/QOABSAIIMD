import {describe,it,expect,vi} from 'vitest';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../mobile-session-state.js',()=>({assertMobileSession:vi.fn()}));
import {accepted,assertFoodBetLimit,resolveSharedEntry} from './shared-games.js';
import {previewRound} from './shared-preview.js';
import {validateGame} from './rules.mjs';
const game={engine:'teenpatti',pointReturnMultiplier:3};
describe('Teen Patti two-hand bets',()=>{
 it('chooses two distinct hands and charges exactly two amounts',()=>{
  for(const n of [0,1,2]){
   const bet=accepted(game,{auto:true,amount:100},()=>n);
   expect(Object.keys(bet.bets)).toHaveLength(2);expect(bet.amount).toBe(200);
   expect(Object.values(bet.bets)).toEqual([100,100]);
  }
  for(const amount of [0,-1,1.5,Number.MAX_SAFE_INTEGER])expect(()=>accepted(game,{auto:true,amount},()=>0)).toThrow();
 });
 it('allows existing-hand topups but rejects a third hand, including mixed auto/manual bets',()=>{
  const entries=[{input:{bets:{1:100,2:100}},amount:200}];
  expect(()=>assertFoodBetLimit(game,entries,{choice:'1',amount:100})).not.toThrow();
  expect(()=>assertFoodBetLimit(game,entries,{choice:'3',amount:100})).toThrow(/at most 2 hands/);
  expect(()=>assertFoodBetLimit(game,[{input:{choice:'1'},amount:100}],{bets:{2:100,3:100}})).toThrow(/at most 2 hands/);
 });
 it('settles each selected stake using the existing multiplier, including tied winners',()=>{
  const entry={day:{settings:game},input:{bets:{1:100,2:100},currency:'COINS'},amount:200};
  expect(resolveSharedEntry(entry,{result:'1',winners:['1']}).payout).toBe(300);
  expect(resolveSharedEntry(entry,{result:'3',winners:['3']}).payout).toBe(0);
  expect(resolveSharedEntry(entry,{result:'1',winners:['1','2']}).payout).toBe(600);
  expect(resolveSharedEntry({...entry,amount:100,input:{choice:'1'}},{result:'1',winners:['1']}).payout).toBe(300);
 });
 it('rejects a third hand without debit, makes retries idempotent, and resets next round',()=>{
  const now=Date.parse('2026-10-18T00:00:01Z'),owner='teen-two-hand-test';
  const row={id:'teenpatti',revision:1,settings:validateGame({id:'teenpatti',name:'Teen Patti',engine:'teenpatti',status:'paused',minBet:10,maxBet:10000})};
  const state=previewRound(owner,row,{action:'shared-state'},now);
  const request={action:'shared-enter',id:'auto',dayId:state.dayId,slot:state.slot,auto:true,amount:100};
  const receipt=previewRound(owner,row,request,now);previewRound(owner,row,request,now);
  expect(previewRound(owner,row,{action:'shared-state'},now).availablePoints).toBe('9800');
  const missing=['1','2','3'].find(id=>!receipt.input.bets[id]);
  expect(()=>previewRound(owner,row,{...request,id:'third',auto:false,choice:missing},now)).toThrow(/at most 2 hands/);
  expect(previewRound(owner,row,{action:'shared-state'},now).availablePoints).toBe('9800');
  const nextTime=state.endsAt+1000,next=previewRound(owner,row,{action:'shared-state'},nextTime);
  expect(()=>previewRound(owner,row,{...request,id:'next',auto:false,choice:missing,slot:next.slot},nextTime)).not.toThrow();
 });
});
