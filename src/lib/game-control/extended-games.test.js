import { expect, it } from "vitest";
import { triviaTier, selectTrivia, triviaPools } from "./trivia-rounds.mjs";
import { rankHand, dealTeenPatti } from "./teen-patti.mjs";
import { resolveMini } from "./mini-games.mjs";
import { validateGame } from "./rules.mjs";
it("maps exact tiers and custom overrides",()=>{
 for(const n of [10,50,100])expect(triviaTier(n)).toEqual({tier:"easy",count:1});
 expect(triviaTier(500)).toEqual({tier:"medium",count:2});expect(triviaTier(1000)).toEqual({tier:"hard",count:3});
 for(const n of [100,500,1000,10000])expect(triviaTier(n,true)).toEqual({tier:"expert",count:5});
 expect(triviaTier(101)).toEqual({tier:"expert",count:5});
});
it("uses every question before repeating, with no duplicates inside a round",()=>{
 for(const amount of [100,500,1000,2000]){
 let history={},ids=[];const plan=triviaTier(amount);
 for(let i=0;i<30/plan.count;i++){const r=selectTrivia(amount,false,history,()=>0);history=r.history;ids.push(...r.questions.map(q=>q.id));}
 expect(new Set(ids).size).toBe(triviaPools[plan.tier].length);
 const next=selectTrivia(amount,false,history,()=>0);expect(new Set(next.questions.map(q=>q.id)).size).toBe(plan.count);
 }
});
it("requires all trivia answers and applies configured points",()=>{
 const g={engine:"trivia",status:"active",minBet:10,maxBet:1000,pointReturnMultiplier:3};
 const c={questions:[{answer:"0"},{answer:"2"}],expiresAt:2000};
 expect(resolveMini(g,500,["0","2"],0,c,1000).payout).toBe(1500);
 expect(resolveMini(g,500,["0","1"],0,c,1000).payout).toBe(0);
 expect(()=>resolveMini(g,500,["0"],0,c,1000)).toThrow("every question");
});
it("ranks Teen Patti categories and A23 variant",()=>{
 expect(rankHand([12,25,38])[0]).toBe(6);
 expect(rankHand([12,11,10])).toEqual([5,14]);
 expect(rankHand([12,0,1])).toEqual([5,13.5]);
 expect(rankHand([12,13,27])[0]).toBe(4);
 expect(rankHand([1,4,8])[0]).toBe(3);
 expect(rankHand([12,25,0])[0]).toBe(2);
 const deal=dealTeenPatti(()=>0);expect(new Set([...deal.playerCards,...deal.computerCards]).size).toBe(6);
});
it("validates admin limits and point-return controls",()=>{
 const base={id:"test-game",name:"Test",engine:"trivia",status:"active",minBet:10,maxBet:10000};
 expect(validateGame({...base,pointReturnMultiplier:4,triviaSeconds:30}).pointReturnMultiplier).toBe(4);
 for(const patch of [{pointReturnMultiplier:101},{triviaSeconds:0},{reactionWindowMs:1}])expect(()=>validateGame({...base,...patch})).toThrow();
});
