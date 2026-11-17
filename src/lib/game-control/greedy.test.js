import {describe,it,expect} from "vitest";
import {greedySettings,greedyResult,greedyFoods} from "./greedy.mjs";
import {validateGame} from "./rules.mjs";
import {resolveMini} from "./mini-games.mjs";
import {sharedOutcome} from "./shared-engine.mjs";
describe("Greedy",()=>{
 const game=validateGame({id:"greedy",name:"Greedy",engine:"greedy",status:"active",minBet:10,maxBet:10000});
 it("has eight configurable food outcomes",()=>{expect(game.greedyReturns).toEqual([45,25,15,10,5,5,5,5]);for(let i=0;i<8;i++)expect(greedyResult(game,i)).toBe(greedyFoods[i].id);});
 it.each(greedyFoods.map((food,index)=>[food.id,food.returns,index]))("settles %s at its configured gross multiplier",(id,multiplier,index)=>{
  expect(resolveMini(game,100,id,index).payout).toBe(100*multiplier);
 });
 it("rejects invalid configuration",()=>{expect(()=>greedySettings({greedyWeights:Array(8).fill(0)})).toThrow();expect(()=>greedySettings({greedyReturns:[1000]})).toThrow();});
 it("uses each food's return without wallets",()=>{expect(resolveMini(game,100,"chicken",0).payout).toBe(4500);expect(resolveMini(game,100,"strawberry",0).payout).toBe(0);expect(()=>resolveMini(game,100,"fake",0)).toThrow();});
 it("gives everyone the same room outcome",()=>{const day={seed:"test",settings:{...game,outcomeScope:"application-v1"}};expect(sharedOutcome(day,"ROOM-1",5)).toEqual(sharedOutcome(day,"ROOM-2",5));});
 it("respects configured weights",()=>{const g={...game,greedyWeights:[0,0,0,0,1,0,0,0]};expect(sharedOutcome({seed:"test",settings:g},"room",99).result).toBe("grapes");});
});
