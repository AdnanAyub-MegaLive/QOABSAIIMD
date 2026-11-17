import {describe,it,expect,vi} from 'vitest';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../mobile-session-state.js',()=>({assertMobileSession:vi.fn()}));
import {assertFoodBetLimit} from './shared-games.js';
import {previewRound} from './shared-preview.js';
import {greedyFoods} from './greedy.mjs';
import {pizzaFoods} from './pizza.mjs';
import {validateGame} from './rules.mjs';
for(const [engine,foods] of [['greedy',greedyFoods],['pizza',pizzaFoods]])describe(`${engine} six-food cap`,()=>{
 it('counts manual and Auto Play selections together, allowing top-ups',()=>{
  const entries=[{input:{bets:Object.fromEntries(foods.slice(0,6).map(f=>[f.id,10]))},amount:60}];
  expect(()=>assertFoodBetLimit({engine},entries,{choice:foods[0].id,amount:10})).not.toThrow();
  expect(()=>assertFoodBetLimit({engine},entries,{choice:foods[6].id,amount:10})).toThrow(/at most 6/);
  expect(()=>assertFoodBetLimit({engine},entries,{bets:Object.fromEntries(foods.slice(2).map(f=>[f.id,10]))})).toThrow(/at most 6/);
 });
 it('rejects seventh/eighth foods without debit, retries once and resets next round',()=>{
  const now=Date.parse('2026-10-18T00:00:01Z'),owner=`limit-${engine}`;
  const row={id:engine,revision:1,settings:validateGame({id:engine,name:engine,engine,status:'paused',minBet:10,maxBet:10000})};
  const state=previewRound(owner,row,{action:'shared-state'},now);
  const bet=(i,id=String(i))=>({action:'shared-enter',id,dayId:state.dayId,slot:state.slot,choice:foods[i].id,amount:10});
  for(let i=0;i<6;i++)previewRound(owner,row,bet(i),now);
  previewRound(owner,row,bet(0),now);
  for(const i of [6,7])expect(()=>previewRound(owner,row,bet(i),now)).toThrow(/at most 6/);
  expect(previewRound(owner,row,{action:'shared-state'},now).availablePoints).toBe('9940');
  previewRound(owner,row,bet(0,'topup'),now);
  expect(previewRound(owner,row,{action:'shared-state'},now).availablePoints).toBe('9930');
  const nextTime=state.endsAt+1000,next=previewRound(owner,row,{action:'shared-state'},nextTime);
  expect(()=>previewRound(owner,row,{...bet(7,'next'),slot:next.slot},nextTime)).not.toThrow();
 });
});
