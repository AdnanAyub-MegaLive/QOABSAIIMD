import {describe,it,expect} from "vitest";
import {pizzaSettings,pizzaResult,pizzaFoods} from "./pizza.mjs";
import {validateGame} from "./rules.mjs";
import {resolveMini} from "./mini-games.mjs";
import {sharedOutcome} from "./shared-engine.mjs";
describe("Pizza",()=>{
 const game=validateGame({id:"pizza",name:"Pizza",engine:"pizza",status:"active",minBet:10,maxBet:10000});
 it("has eight configurable food outcomes",()=>{expect(game.pizzaReturns).toEqual([5,10,15,25,45,5,5,5]);for(let i=0;i<8;i++)expect(pizzaResult(game,i)).toBe(pizzaFoods[i].id);});
 it("rejects invalid configuration",()=>{expect(()=>pizzaSettings({pizzaWeights:Array(8).fill(0)})).toThrow();expect(()=>pizzaSettings({pizzaReturns:[1000]})).toThrow();});
 it("uses each food's return without wallets",()=>{expect(resolveMini(game,100,"steak",4).payout).toBe(4500);expect(resolveMini(game,100,"tomato",4).payout).toBe(0);expect(()=>resolveMini(game,100,"fake",4)).toThrow();});
 it("gives everyone the same room outcome",()=>{const day={seed:"test",settings:game};expect(sharedOutcome(day,"ROOM-1",5)).toEqual(sharedOutcome(day,"ROOM-1",5));});
 it("respects configured weights",()=>{const g={...game,pizzaWeights:[0,0,0,0,1,0,0,0]};expect(sharedOutcome({seed:"test",settings:g},"room",99).result).toBe("steak");});
});
