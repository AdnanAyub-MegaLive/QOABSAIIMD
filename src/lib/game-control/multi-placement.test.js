import {it,expect,vi,afterEach} from "vitest";
vi.mock("../prisma.js",()=>({prisma:{}}));
vi.mock("../mobile-session-state.js",()=>({assertMobileSession:vi.fn()}));
import {enterSharedRound,settleSharedGames,accepted} from "./shared-games.js";
import {previewRound} from "./shared-preview.js";
const now=Date.parse("2026-10-18T00:00:05Z");
afterEach(()=>vi.restoreAllMocks());
const game={id:"flip",engine:"flip",status:"active",minBet:100,maxBet:100,winProbability:100,payoutMultiplier:2};
function fixture(){
 let points=2000000n,queue=Promise.resolve();const entries=new Map();
 const day={id:"flip:2026-10-18",gameId:"flip",day:new Date("2026-10-18"),settings:game,durationMs:40000,seed:"test"};
 const tx={$queryRaw:vi.fn(),user:{findUnique:async()=>({id:"u",publicId:"USR-T",status:"ACTIVE"})},audioRoom:{findUnique:async()=>({id:"r",status:"LIVE"})},audioRoomMember:{findUnique:async()=>({socketCount:1})},audioRoomBan:{findFirst:async()=>null},gameDefinition:{findUnique:async()=>({id:"flip",settings:game})},sharedGameDay:{findUnique:async()=>day,upsert:async()=>day},gamePlayAccount:{upsert:async()=>{},updateMany:async({where,data})=>{if(points<where.points.gte)return{count:0};points-=data.points.decrement;return{count:1};},update:async({data})=>{points+=data.points.increment;}},sharedGameEntry:{findUnique:async({where})=>{const e=entries.get(where.id);return e?{...e,day}:null;},create:async({data})=>{const e={...data,status:"PENDING",answer:null,result:null};entries.set(e.id,e);return e;},findMany:async()=>[...entries.values()].filter(e=>e.status==="PENDING").map(e=>({id:e.id})),update:async({where,data})=>{Object.assign(entries.get(where.id),data);}},walletTransaction:{create:vi.fn()}};
 const db={...tx,$transaction:fn=>{const result=queue.then(()=>fn(tx));queue=result.catch(()=>{});return result;}};
 const input=n=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,gameId:"flip",dayId:day.id,slot:0,amount:100,choice:"heads"});
 return{db,tx,input,entries,points:()=>points};
}
it("accepts placements above old admin maximum and below old minimum",()=>{expect(accepted(game,{amount:1,choice:"heads"}).amount).toBe(1);expect(accepted(game,{amount:1500000,choice:"heads"}).amount).toBe(1500000);expect(accepted({...game,engine:"roulette"},{amount:1500000,bets:{Red:1500000}}).amount).toBe(1500000);});
it("serializes multiple placements, rejects overspend, replays once and settles each once",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);const f=fixture(),identity={userId:"u",roomId:"ROOM-T",expiresAt:new Date("2099-01-01"),claims:{userId:"USR-T",exp:4070908800}};
 const a={...f.input(1),amount:1500000},b={...f.input(2),amount:600000,choice:"tails"};
 const results=await Promise.allSettled([enterSharedRound(identity,a,f.db),enterSharedRound(identity,b,f.db)]);
 expect(results.map(r=>r.status)).toEqual(["fulfilled","rejected"]);expect(f.points()).toBe(500000n);
 await enterSharedRound(identity,a,f.db);expect(f.points()).toBe(500000n);
 await expect(enterSharedRound(identity,{...a,amount:1},f.db)).rejects.toThrow(/conflict/);
 await enterSharedRound(identity,{...b,amount:500000},f.db);expect(f.points()).toBe(0n);expect(f.entries.size).toBe(2);
 await settleSharedGames(f.db,new Date(now+30000));expect(f.points()).toBe(3000000n);
 await settleSharedGames(f.db,new Date(now+30000));expect(f.points()).toBe(3000000n);
 expect(f.tx.walletTransaction.create).not.toHaveBeenCalled();
});
it("preview supports different choices and aggregates every placement",()=>{
 const row={id:"flip",revision:1,settings:game},owner="multi-preview",s=previewRound(owner,row,{action:"shared-state"},now);
 for(let n=0;n<3;n++)previewRound(owner,row,{action:"shared-enter",id:`p${n}`,dayId:s.dayId,slot:s.slot,amount:100,choice:n===1?"tails":"heads"},now);
 const next=previewRound(owner,row,{action:"shared-state"},now);expect(next.myTotals).toEqual({heads:"200",tails:"100"});expect(next.myTotal).toBe("300");expect(next.availablePoints).toBe("9700");expect(next.participants).toBe(1);
});
