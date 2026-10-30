import {it,expect,vi,afterEach} from "vitest";
vi.mock("../prisma.js",()=>({prisma:{}}));
vi.mock("../mobile-session-state.js",()=>({assertMobileSession:vi.fn()}));
import {enterSharedRound,settleSharedGames,accepted} from "./shared-games.js";
import {previewRound} from "./shared-preview.js";
const now=Date.parse("2026-10-18T00:00:05Z");
afterEach(()=>vi.restoreAllMocks());
const game={id:"flip",name:"Lucky Flip",engine:"flip",status:"active",revision:1,minBet:10,maxBet:1000,winProbability:100,payoutMultiplier:2};
const identity={userId:"u",roomId:"ROOM-T",expiresAt:new Date("2099-01-01"),claims:{userId:"USR-T",exp:4070908800}};
function fixture(){
 let coins=1000n,points=10000n,queue=Promise.resolve();const entries=new Map(),ledger=[],rounds=[],logs=[];
 const day={id:"flip:2026-10-18",gameId:"flip",day:new Date("2026-10-18"),settings:game,durationMs:40000,seed:"test"};
 const tx={$queryRaw:vi.fn(),user:{findUnique:async()=>({id:"u",publicId:"USR-T",name:"Test",status:"ACTIVE",coinBalance:coins}),updateMany:async({where,data})=>{if(coins<where.coinBalance.gte)return{count:0};coins-=data.coinBalance.decrement;return{count:1};},update:async({data})=>{coins+=data.coinBalance.increment;}},audioRoom:{findUnique:async()=>({id:"r",status:"LIVE"})},audioRoomMember:{findUnique:async()=>({socketCount:1})},audioRoomBan:{findFirst:async()=>null},gameDefinition:{findUnique:async()=>({id:"flip",revision:1,settings:game})},sharedGameDay:{findFirst:async()=>day,findUnique:async()=>day,upsert:async()=>day},gamePlayAccount:{update:async({data})=>{points+=data.points.increment;}},sharedGameEntry:{aggregate:async({where})=>({_sum:{amount:[...entries.values()].filter(e=>e.slot===where.slot).reduce((n,e)=>n+e.amount,0n)}}),findUnique:async({where})=>{const e=entries.get(where.id);return e?{...e,day}:null;},create:async({data})=>{const e={...data,createdAt:new Date(now),status:"PENDING",answer:null,result:null};entries.set(e.id,e);return e;},findMany:async()=>[...entries.values()].filter(e=>e.status==="PENDING").map(e=>({id:e.id})),update:async({where,data})=>{Object.assign(entries.get(where.id),data);}},walletTransaction:{create:vi.fn(async({data})=>{ledger.push(data);})},gameRound:{create:async({data})=>rounds.push(data)},gameLog:{create:async({data})=>logs.push(data)}};
 const db={...tx,$transaction:fn=>{const result=queue.then(async()=>{const saved={coins,points,entries:structuredClone(entries),ledger:ledger.length,rounds:rounds.length,logs:logs.length};try{return await fn(tx);}catch(e){coins=saved.coins;points=saved.points;entries.clear();for(const[k,v]of saved.entries)entries.set(k,v);ledger.length=saved.ledger;rounds.length=saved.rounds;logs.length=saved.logs;throw e;}});queue=result.catch(()=>{});return result;}};
 const input=n=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,gameId:"flip",dayId:day.id,slot:0,amount:100,choice:"heads"});
 return{db,tx,input,entries,ledger,rounds,logs,day,coins:()=>coins,points:()=>points,setCoins:n=>{coins=n;}};
}
it("validates positive whole coins and choices without configured wager caps",()=>{
 for(const amount of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])expect(()=>accepted(game,{amount,choice:"heads"})).toThrow();
 expect(accepted(game,{amount:100,choice:"heads"}).amount).toBe(100);
 expect(()=>accepted(game,{amount:100,choice:"fake"})).toThrow();
});
it("serializes placements, checks wallet funds, replays once and settles each once",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);const f=fixture();
 const a={...f.input(1),amount:700},b={...f.input(2),amount:400,choice:"tails"};
 const results=await Promise.allSettled([enterSharedRound(identity,a,f.db),enterSharedRound(identity,b,f.db)]);
 expect(results.map(r=>r.status)).toEqual(["fulfilled","rejected"]);expect(f.coins()).toBe(300n);
 await enterSharedRound(identity,a,f.db);expect(f.coins()).toBe(300n);
 await expect(enterSharedRound(identity,{...a,amount:100},f.db)).rejects.toThrow(/conflict/);
 await enterSharedRound(identity,{...b,amount:300},f.db);expect(f.coins()).toBe(0n);
 await settleSharedGames(f.db,new Date(now+30000));await settleSharedGames(f.db,new Date(now+30000));
 expect(f.coins()).toBe(1400n);expect(f.points()).toBe(10000n);
 expect(f.ledger.map(e=>e.type)).toEqual(["GAME_WAGER","GAME_WAGER","GAME_PAYOUT"]);
 expect(f.rounds).toHaveLength(2);expect(f.logs).toHaveLength(2);expect(f.rounds[0].payload.currency).toBe("COINS");
});
it("rejects insufficient balance and rolls back a failed ledger write",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);const f=fixture();f.setCoins(50n);
 await expect(enterSharedRound(identity,f.input(1),f.db)).rejects.toThrow(/Not enough coins/);expect(f.entries.size).toBe(0);
 f.setCoins(1000n);f.tx.walletTransaction.create.mockRejectedValueOnce(new Error("ledger unavailable"));
 await expect(enterSharedRound(identity,f.input(1),f.db)).rejects.toThrow(/ledger/);expect(f.coins()).toBe(1000n);expect(f.entries.size).toBe(0);
});
it("rolls back payout failures and retries settlement exactly once",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);const f=fixture();await enterSharedRound(identity,f.input(1),f.db);
 f.tx.walletTransaction.create.mockRejectedValueOnce(new Error("ledger unavailable"));
 await expect(settleSharedGames(f.db,new Date(now+30000))).rejects.toThrow(/ledger/);expect(f.coins()).toBe(900n);expect(f.entries.values().next().value.status).toBe("PENDING");
 await settleSharedGames(f.db,new Date(now+30000));expect(f.coins()).toBe(1100n);expect(f.ledger).toHaveLength(2);
});
it("preserves legacy free-point wagers without crediting real coins",async()=>{
 const f=fixture(),id=f.input(1).id;f.entries.set(id,{id,dayId:f.day.id,roomId:"ROOM-T",userId:"u",slot:0,amount:100n,input:{choice:"heads"},status:"PENDING",createdAt:new Date(now)});
 await settleSharedGames(f.db,new Date(now+30000));expect(f.coins()).toBe(1000n);expect(f.points()).toBe(10200n);expect(f.ledger).toHaveLength(0);
});
it("checks membership and pause before charging",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);const f=fixture();f.tx.audioRoomMember.findUnique=async()=>null;
 await expect(enterSharedRound(identity,f.input(1),f.db)).rejects.toThrow(/Join the room/);
 f.tx.audioRoomMember.findUnique=async()=>({socketCount:1});f.tx.gameDefinition.findUnique=async()=>({settings:{...game,status:"paused"}});
 await expect(enterSharedRound(identity,f.input(1),f.db)).rejects.toThrow(/paused/);expect(f.coins()).toBe(1000n);
});
it("preview isolates balances and checks available practice coins",()=>{
 const row={id:"flip",revision:1,settings:game},owner="multi-preview",s=previewRound(owner,row,{action:"shared-state"},now);
 for(let n=0;n<3;n++)previewRound(owner,row,{action:"shared-enter",id:`p${n}`,dayId:s.dayId,slot:s.slot,amount:100,choice:n===1?"tails":"heads"},now);
 const next=previewRound(owner,row,{action:"shared-state"},now);expect(next.myTotals).toEqual({heads:"200",tails:"100"});expect(next.availablePoints).toBe("9700");
 expect(()=>previewRound(owner,row,{action:"shared-enter",id:"too-much",dayId:s.dayId,slot:s.slot,amount:9701,choice:"heads"},now)).toThrow(/refill/);
});

it("switches new bets to revised settings without changing old receipts or paying twice",async()=>{
 const clock=vi.spyOn(Date,"now").mockReturnValue(now),f=fixture(),days=new Map([[f.day.id,f.day]]);
 f.tx.sharedGameDay={
   findFirst:async({where})=>[...days.values()].filter(d=>d.day>=where.day.gte&&d.day<=where.day.lte).sort((a,b)=>b.day-a.day)[0]??null,
   findUnique:async({where})=>days.get(where.id)??null,
   upsert:async({where,create,update})=>{const row=days.has(where.id)?{...days.get(where.id),...update}:create;days.set(where.id,row);return row;},
 };
 f.tx.gameDefinition.findUnique=async()=>({id:game.id,revision:2,settings:{...game,winProbability:0,payoutMultiplier:3,minBet:100}});
 f.tx.sharedGameEntry.findUnique=async({where})=>{const e=f.entries.get(where.id);return e?{...e,day:days.get(e.dayId)}:null;};
 const old=f.input(10);await enterSharedRound(identity,old,f.db);
 expect(f.coins()).toBe(900n);expect(days.size).toBe(2);
 clock.mockReturnValue(Date.parse("2026-10-18T00:00:40Z"));
 const revised=[...days.values()].find(d=>d.id!==f.day.id);
 await expect(enterSharedRound(identity,{...f.input(11),slot:1},f.db)).rejects.toThrow(/closed/);
 expect(accepted(revised.settings,{amount:50,choice:"heads"}).amount).toBe(50);
 const next={...f.input(12),dayId:revised.id,choice:"tails"};
 await enterSharedRound(identity,next,f.db);
 await enterSharedRound(identity,old,f.db); // retry a pre-change accepted request
 expect(f.coins()).toBe(800n);
 await settleSharedGames(f.db,new Date(now+80000));
 await settleSharedGames(f.db,new Date(now+80000));
 expect(f.rounds.map(r=>r.payload.payout)).toEqual([200,300]);
 expect(f.coins()).toBe(1300n);expect(f.ledger).toHaveLength(4);
 expect(f.day.settings.revision).toBe(1);
});

it("allows funded stakes above the former per-bet and cumulative caps, but rejects overdrafts",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(now);const f=fixture();f.setCoins(1000000000n);
 await enterSharedRound(identity,{...f.input(1),amount:600000000},f.db);
 await enterSharedRound(identity,{...f.input(2),amount:400000000},f.db);
 expect(f.coins()).toBe(0n);
 await expect(enterSharedRound(identity,{...f.input(3),amount:1},f.db)).rejects.toThrow(/Not enough coins/);
 expect(f.entries.size).toBe(2);
 await settleSharedGames(f.db,new Date(now+30000));
 expect(f.coins()).toBe(2000000000n);
});
