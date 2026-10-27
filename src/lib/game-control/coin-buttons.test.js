import {describe,it,expect} from 'vitest';
import {coinButtons,validateCoinButtons} from './coin-buttons.mjs';
import {validateGame} from './rules.mjs';
describe('coin button configuration',()=>{
 it('preserves legacy defaults and admin order',()=>{
  expect(coinButtons({minBet:10,maxBet:500})).toEqual([10,100,500]);
  expect(validateCoinButtons({minBet:10,maxBet:1000,coinButtons:[500,25,100]})).toEqual([500,25,100]);
 });
 it.each([[],[10,10],[0],[1001],[1.5],['100'],[10,20,30,40,50]].map(values=>[values]))('rejects invalid buttons %j',values=>{
  expect(()=>validateCoinButtons({minBet:1,maxBet:1000,coinButtons:values})).toThrow();
 });
 it.each(['rocket','flip','roulette','pizza','trivia','teenpatti'])('persists buttons for %s',engine=>{
  const game=validateGame({id:'test-game',name:'Test',engine,status:'paused',minBet:10,maxBet:1000,coinButtons:[25,250],winProbability:50,payoutMultiplier:2,pocketWeights:Array(37).fill(1)});
  expect(game.coinButtons).toEqual([25,250]);
  expect(validateGame(game).coinButtons).toEqual([25,250]);
 });
});

it('allows 100M coin limits and buttons but rejects larger limits',()=>{
 const input={id:'rocket',name:'Rocket',engine:'rocket',status:'paused',minBet:10,maxBet:100000000,coinButtons:[100,100000000]};
 expect(validateGame(input).maxBet).toBe(100000000);
 expect(validateGame(input).coinButtons).toEqual([100,100000000]);
 expect(()=>validateGame({...input,maxBet:100000001})).toThrow();
});
