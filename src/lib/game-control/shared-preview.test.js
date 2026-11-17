import {it,expect,vi} from "vitest";
vi.mock("../prisma.js",()=>({prisma:{}}));
vi.mock("../mobile-session-state.js",()=>({assertMobileSession:vi.fn()}));
import {previewRound} from "./shared-preview.js";
import {validateGame} from "./rules.mjs";
const start=Date.parse("2026-10-18T00:00:00Z");
const row=engine=>({id:engine,revision:1,settings:validateGame({id:engine,name:engine,engine,status:"paused",minBet:10,maxBet:10000,winProbability:100,payoutMultiplier:2,pocketWeights:Array(37).fill(1)})});
it.each(["teenpatti","pizza","greedy","flip","roulette","rps","dice","penalty","reaction","trivia"])("%s preview advances empty rounds without a start command",engine=>{
 const g=row(engine),a=previewRound(`empty-${engine}`,g,{action:"shared-state"},start+1000),b=previewRound(`empty-${engine}`,g,{action:"shared-state"},a.endsAt+1000);
 expect(b.roundNumber).toBe(a.roundNumber+1);expect(b.participants).toBe(0);expect(b.availablePoints).toBe("10000");expect(a.outcome).toBeNull();
});
it("reserves once, settles on the clock and rejects late placements",()=>{
 const g=row("flip"),owner="retry",s=previewRound(owner,g,{action:"shared-state"},start+1000);
 const req={action:"shared-enter",id:"test-id",dayId:s.dayId,slot:s.slot,amount:100,choice:"heads"};
 const first=previewRound(owner,g,req,start+2000);expect(previewRound(owner,g,req,start+3000)).toEqual(first);
 expect(previewRound(owner,g,{action:"shared-state"},start+4000).availablePoints).toBe("9900");
 expect(()=>previewRound(owner,g,{...req,id:"late"},start+21000)).toThrow(/closed/);
 const settled=previewRound(owner,g,{action:"shared-state"},start+31000);
 expect(settled.availablePoints).toBe("10100");expect(settled.mine.status).toBe("SETTLED");
 expect(previewRound(owner,g,{action:"shared-state"},start+32000).availablePoints).toBe("10100");
});
it("reveals three hands only after the countdown, then starts the next round",()=>{
 const g=row("teenpatti"),owner="cards";
 expect(previewRound(owner,g,{action:"shared-state"},start+29000).outcome).toBeNull();
 expect(previewRound(owner,g,{action:"shared-state"},start+31000).outcome.hands).toHaveLength(3);
 expect(previewRound(owner,g,{action:"shared-state"},start+41000)).toMatchObject({phase:"open",roundNumber:2,outcome:null});
});

it('Greedy repeated bets settle once with configured returns and preserve practice wallet isolation',()=>{
 const g=row('greedy');g.settings.greedyWeights=[0,0,0,0,0,0,0,1];
 const owner='greedy-repeat',s=previewRound(owner,g,{action:'shared-state'},start+1000);
 const req={action:'shared-enter',id:'greedy-bet-1',dayId:s.dayId,slot:s.slot,amount:100,choice:'strawberry'};
 previewRound(owner,g,req,start+2000);previewRound(owner,g,req,start+2100);
 previewRound(owner,g,{...req,id:'greedy-bet-2'},start+3000);
 const open=previewRound(owner,g,{action:'shared-state'},start+4000);
 expect(open.availablePoints).toBe('9800');expect(open.myTotals.strawberry).toBe('200');
 const done=previewRound(owner,g,{action:'shared-state'},start+31000);
 expect(done.availablePoints).toBe('10800');expect(done.mineEntries).toHaveLength(2);
 expect(done.mineEntries.map(e=>e.result.payout)).toEqual([500,500]);
 expect(previewRound(owner,g,{action:'shared-state'},start+32000).availablePoints).toBe('10800');
});
