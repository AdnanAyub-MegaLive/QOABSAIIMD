import { expect,it,vi } from "vitest";
import { checkInDay,validateTaskOptions,validateReward } from "./task-center-config.js";
import { measuredTaskProgress } from "./task-center-progress.js";
import { taskCenterTemplates,installTaskCenter } from "./task-center-templates.js";
const now=new Date("2026-10-21T12:00:00Z"),start=new Date("2026-10-21T00:00:00Z");
it("restarts after a missed check-in and wraps day 7 to day 1",()=>{
 expect(checkInDay({currentStreak:7,lastSignInDate:new Date("2026-10-20")},now)).toEqual({count:8,day:1,claimedToday:false});
 expect(checkInDay({currentStreak:4,lastSignInDate:new Date("2026-10-19")},now).day).toBe(1);
 expect(checkInDay({currentStreak:4,lastSignInDate:start},now)).toEqual({count:4,day:4,claimedToday:true});
});
it.each([{kind:"COINS",coins:-1},{kind:"COINS",coins:1.5},{kind:"COINS",coins:1000000001},{kind:"BEANS",coins:100},{kind:"VIP",id:"tier",days:0}])("rejects invalid rewards %j",r=>expect(()=>validateReward(r)).toThrow());
it("supports separate task codes for the same metric and exact seven-day rewards",()=>{
 const body={type:"DAILY_ROSE",metric:"SEND_GIFTS",cadence:"DAILY",rewardCoins:"100",config:{giftAssetId:"AST-ROSE"}};
 expect(validateTaskOptions(body).metric).toBe("SEND_GIFTS");
 expect(()=>validateTaskOptions({...body,metric:"SIGN_IN",config:{days:[{kind:"COINS",coins:"1"}]}})).toThrow();
 expect(()=>validateTaskOptions({...body,config:{requiresGiftSelection:true},active:true})).toThrow();
});
it("measures only non-reversed gifts, supports asset filters and clamps big totals safely",async()=>{
 const aggregate=vi.fn(async()=>({_sum:{coinValue:9000000000000000000n}}));
 const result=await measuredTaskProgress({giftTransaction:{aggregate}},"u",{metric:"GIFT_COINS_SENT",targetValue:500,config:{giftAssetId:"AST-ROSE"}},start,now);
 expect(result).toBe(500);expect(aggregate).toHaveBeenCalledWith({where:{senderId:"u",reversedAt:null,createdAt:{gte:start,lte:now},giftAsset:{publicId:"AST-ROSE"}},_sum:{coinValue:true}});
});
it("uses explicit recipients first and verified public-ID Talent mapping",async()=>{
 const aggregate=vi.fn(async()=>({_sum:{coinValue:100n}}));
 await measuredTaskProgress({user:{findUnique:async()=>({publicId:"USR-1"})},talent:{findMany:async()=>[{id:"talent"}]},giftTransaction:{aggregate}},"u",{metric:"GIFT_COINS_RECEIVED",targetValue:1000},start,now);
 expect(aggregate.mock.calls[0][0].where.OR).toEqual([{recipientUserId:"u"},{recipientUserId:null,talentId:{in:["talent"]}}]);
});
it("uses current active followed users and the configured level floor",async()=>{
 const count=vi.fn(async()=>3);expect(await measuredTaskProgress({userFollow:{count}},"u",{metric:"FOLLOW_USERS",targetValue:5,config:{minLevel:10}},start,now)).toBe(3);
 expect(count.mock.calls[0][0].where.followed.progress.some).toEqual({track:{in:["USER","CHARM"]},currentLevel:{gte:10}});
});
it("excludes business funds and bonus credits from recharge goals",async()=>{
 const count=vi.fn(async()=>2);await measuredTaskProgress({walletTransaction:{count}},"u",{metric:"RECHARGE_COUNT",targetValue:5,config:{minCoins:"1000"}},start,now);
 const w=count.mock.calls[0][0].where;expect(w.status).toBe("COMPLETED");expect(w.coins.gte).toBe(1000n);expect(w.OR).toEqual([{type:"COIN_TOP_UP"},{type:"TRANSFER_RECEIVED",metadata:{path:["wallet"],equals:"PERSONAL"}}]);
});
it("does not infer external activity from client data",async()=>{expect(await measuredTaskProgress({},"u",{metric:"MANUAL",targetValue:1},start,now)).toBeNull();});
it('counts only server-settled free-play receipts since task creation',async()=>{
 const count=vi.fn(async()=>2),createdAt=new Date('2026-10-21T10:00:00Z');
 expect(await measuredTaskProgress({gamePlayRound:{count}},'u',{metric:'PLAY_FREE_GAME',targetValue:1,createdAt},start,now)).toBe(1);
 expect(count).toHaveBeenCalledWith({where:{userId:'u',createdAt:{gte:createdAt,lte:now},payload:{path:['status'],equals:'settled'}}});
});
it("ships Beginner, Daily and Monthly templates without beans/key reward currencies",()=>{
 const rows=taskCenterTemplates();expect(new Set(rows.map(r=>r.cadence))).toEqual(new Set(["BEGINNER","DAILY","MONTHLY"]));expect(new Set(rows.map(r=>r.type)).size).toBe(rows.length);
 expect(rows.every(r=>r.rewardSpec.kind==="COINS")).toBe(true);expect(rows.find(r=>r.id==="TASK-MONTHLY-BONUS").config.requiredCount).toBe(4);
});
it("installer is additive and does not overwrite existing settings",async()=>{
 const upsert=vi.fn();await installTaskCenter({dailyTaskCategory:{upsert},dailyTaskDefinition:{upsert,findFirst:async()=>null},uploadAsset:{findMany:async()=>[]},vipTier:{findFirst:async()=>null}});
 expect(upsert.mock.calls.every(([q])=>Object.keys(q.update).length===0)).toBe(true);
});
