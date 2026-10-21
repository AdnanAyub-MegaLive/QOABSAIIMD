import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({permission:vi.fn(),auth:vi.fn(),db:{admin:{findUnique:vi.fn()},dailyTaskDefinition:{findUnique:vi.fn(),update:vi.fn()},auditLog:{create:vi.fn()},$transaction:vi.fn()}}));
vi.mock("@/lib/portal-admin",()=>({portalPermissionError:mocks.permission}));
vi.mock("../../auth",()=>({auth:mocks.auth}));
vi.mock("@/lib/prisma",()=>({prisma:mocks.db}));
import { DELETE } from "../app/api/admin/daily-tasks/route.js";
const request=()=>new Request("https://portal.test/api/admin/daily-tasks",{method:"DELETE",body:JSON.stringify({id:"task-1"})});
beforeEach(()=>{
 vi.clearAllMocks();mocks.permission.mockResolvedValue(null);mocks.auth.mockResolvedValue({user:{email:"admin@test"}});
 mocks.db.admin.findUnique.mockResolvedValue({id:"admin",name:"Admin",active:true});mocks.db.$transaction.mockImplementation(fn=>fn(mocks.db));
 mocks.db.dailyTaskDefinition.findUnique.mockResolvedValue({id:"task-1",title:"Task",deletedAt:null});
});
it("archives a task with an audit trail without deleting claim history",async()=>{
 expect((await DELETE(request())).status).toBe(200);
 expect(mocks.db.dailyTaskDefinition.update).toHaveBeenCalledWith({where:{id:"task-1"},data:expect.objectContaining({active:false,deletedAt:expect.any(Date)})});
 expect(mocks.db.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({action:"DAILY_TASK_DELETED",metadata:expect.objectContaining({historyPreserved:true})})});
});
it("does not allow an unauthorized deletion",async()=>{
 mocks.permission.mockResolvedValue(new Response(null,{status:403}));expect((await DELETE(request())).status).toBe(403);expect(mocks.db.$transaction).not.toHaveBeenCalled();
});
it("replays an already deleted task without another audit entry",async()=>{
 mocks.db.dailyTaskDefinition.findUnique.mockResolvedValue({deletedAt:new Date()});expect((await DELETE(request())).status).toBe(200);expect(mocks.db.dailyTaskDefinition.update).not.toHaveBeenCalled();expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
});
