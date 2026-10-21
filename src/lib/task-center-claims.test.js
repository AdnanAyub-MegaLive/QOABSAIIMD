import { beforeEach,expect,it,vi } from "vitest";
const db=vi.hoisted(()=>({$transaction:vi.fn(),dailyTaskInstance:{findFirst:vi.fn(),findUnique:vi.fn(),upsert:vi.fn(),updateMany:vi.fn(),update:vi.fn()},dailyTaskCategory:{findUnique:vi.fn()},dailyTaskDefinition:{findMany:vi.fn()},dailyTaskStreak:{findUnique:vi.fn(),upsert:vi.fn()},user:{updateMany:vi.fn(),findUnique:vi.fn()},walletTransaction:{create:vi.fn()},notification:{upsert:vi.fn()},giftTransaction:{aggregate:vi.fn()}}));
vi.mock("./prisma.js",()=>({prisma:db}));
import { claimDailyTask } from "./daily-tasks.js";
const now=new Date("2026-10-21T12:00:00Z"),periodStart=new Date("2026-10-21");
let row;
beforeEach(()=>{
 vi.clearAllMocks();row={id:"instance",userId:"u",periodStart,progressValue:1,claimedAt:null,definition:{id:"d",type:"EXTERNAL",metric:"MANUAL",active:true,categoryKey:"Daily",cadence:"DAILY",targetValue:1,rewardCoins:100n,title:"Task"},reviewStatus:"APPROVED"};
 db.$transaction.mockImplementation(fn=>fn(db));db.dailyTaskInstance.findFirst.mockImplementation(async()=>row);db.dailyTaskCategory.findUnique.mockResolvedValue({active:true});
 db.dailyTaskInstance.updateMany.mockResolvedValue({count:1});db.dailyTaskInstance.update.mockImplementation(async({data})=>{row={...row,...data};return row;});
 db.user.updateMany.mockResolvedValue({count:1});db.user.findUnique.mockResolvedValue({coinBalance:1000n});db.dailyTaskStreak.findUnique.mockResolvedValue(null);
});
it("claims once with a ledger and notification; retries return identical original results",async()=>{
 const result=await claimDailyTask("u","instance",null,now);expect(result.coinBalance).toBe("1000");expect(result.reward).toEqual({kind:"COINS",coins:"100"});
 expect(await claimDailyTask("u","instance",null,now)).toEqual(result);expect(db.user.updateMany).toHaveBeenCalledTimes(1);expect(db.walletTransaction.create).toHaveBeenCalledTimes(1);expect(db.notification.upsert).toHaveBeenCalledTimes(1);
});
it("never rewards unapproved evidence",async()=>{row.reviewStatus="PENDING";await expect(claimDailyTask("u","instance",null,now)).rejects.toMatchObject({code:"TASK_NOT_READY"});expect(db.user.updateMany).not.toHaveBeenCalled();});
it("rejects expired periods before credit",async()=>{row.periodStart=new Date("2026-10-20");await expect(claimDailyTask("u","instance",null,now)).rejects.toMatchObject({code:"TASK_EXPIRED"});expect(db.user.updateMany).not.toHaveBeenCalled();});
it("re-measures gift eligibility at claim time so reversed gifts cannot be used",async()=>{
 row.definition.metric="GIFT_COINS_SENT";db.giftTransaction.aggregate.mockResolvedValue({_sum:{coinValue:0n}});await expect(claimDailyTask("u","instance",null,now)).rejects.toMatchObject({code:"TASK_NOT_READY"});expect(db.walletTransaction.create).not.toHaveBeenCalled();
});
it("pays the configured seventh check-in amount",async()=>{
 row.definition.metric="SIGN_IN";row.definition.config={days:Array.from({length:7},(_,n)=>({kind:"COINS",coins:String(n+1)}))};db.dailyTaskStreak.findUnique.mockResolvedValue({currentStreak:6,lastSignInDate:new Date("2026-10-20")});
 expect((await claimDailyTask("u","instance","SIGN_IN",now)).reward.coins).toBe("7");expect(db.dailyTaskStreak.upsert).toHaveBeenCalled();
});
it("blocks another check-in definition from paying twice on the same day",async()=>{
 row.definition.metric="SIGN_IN";db.dailyTaskStreak.findUnique.mockResolvedValue({currentStreak:1,lastSignInDate:periodStart});await expect(claimDailyTask("u","instance","SIGN_IN",now)).rejects.toMatchObject({code:"TASK_ALREADY_CLAIMED"});expect(db.user.updateMany).not.toHaveBeenCalled();
});
it("retries serialization conflicts",async()=>{
 db.$transaction.mockRejectedValueOnce({code:"P2034"});expect((await claimDailyTask("u","instance",null,now)).coinBalance).toBe("1000");expect(db.$transaction).toHaveBeenCalledTimes(2);
});
it("requires enough distinct completed tasks for a category bonus",async()=>{
 row.definition.metric="COMPLETE_TASKS";row.definition.config={requiredCount:4};db.dailyTaskDefinition.findMany.mockResolvedValue([]);await expect(claimDailyTask("u","instance",null,now)).rejects.toMatchObject({code:"TASK_NOT_READY"});expect(db.user.updateMany).not.toHaveBeenCalled();
});
it("pays a completion bonus after four eligible distinct tasks",async()=>{
 row.definition.metric="COMPLETE_TASKS";row.definition.config={requiredCount:4};
 const children=Array.from({length:4},(_,n)=>({id:`child-${n}`,metric:"MANUAL",type:`CHILD_${n}`,cadence:"DAILY",active:true,targetValue:1}));
 db.dailyTaskDefinition.findMany.mockResolvedValue(children);
 db.dailyTaskInstance.upsert.mockImplementation(async({create})=>({id:create.definitionId,...create,reviewStatus:"APPROVED",progressValue:0}));
 expect((await claimDailyTask("u","instance",null,now)).task.completionProgress).toEqual({completed:4,required:4});
 expect(db.walletTransaction.create).toHaveBeenCalledTimes(1);
});
