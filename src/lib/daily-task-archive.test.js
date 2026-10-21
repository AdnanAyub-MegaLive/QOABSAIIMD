import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ dailyTaskInstance: {findFirst:vi.fn(),updateMany:vi.fn()}, dailyTaskCategory:{findUnique:vi.fn()}, user:{update:vi.fn()}, $transaction:vi.fn() }));
vi.mock("./prisma.js",()=>({prisma:db}));
import { claimDailyTask } from "./daily-tasks.js";
beforeEach(()=>{vi.clearAllMocks();db.$transaction.mockImplementation(fn=>fn(db));});
it.each([{active:false},{active:true,deletedAt:new Date()}])("prevents claims for unavailable tasks without crediting a wallet",async definition=>{
 db.dailyTaskInstance.findFirst.mockResolvedValue({definition});
 await expect(claimDailyTask("u","task")).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
 expect(db.user.update).not.toHaveBeenCalled();expect(db.dailyTaskInstance.updateMany).not.toHaveBeenCalled();
});
it("prevents claims in disabled categories",async()=>{
 db.dailyTaskInstance.findFirst.mockResolvedValue({definition:{active:true,categoryKey:"Daily"}});
 db.dailyTaskCategory.findUnique.mockResolvedValue({active:false});
 await expect(claimDailyTask("u","task")).rejects.toMatchObject({code:"TASK_NOT_FOUND"});
 expect(db.user.update).not.toHaveBeenCalled();
});
