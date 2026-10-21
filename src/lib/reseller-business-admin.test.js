import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({db:{},auth:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:m.db}));
vi.mock("@/lib/portal-admin",()=>({requirePermission:m.auth}));
import {fundReseller} from "../app/reseller-wallet/actions.js";
beforeEach(()=>{
 m.auth.mockReset().mockResolvedValue({id:"admin"});
 Object.assign(m.db,{
 user:{findFirst:vi.fn(async()=>({id:"r",coinBalance:999n,resellerCoinBalance:0n})),updateMany:vi.fn(async()=>({count:1}))},
 resellerRechargeRequest:{findUnique:vi.fn(async()=>null),create:vi.fn()},
 walletTransaction:{create:vi.fn()},auditLog:{create:vi.fn()},
 $transaction:vi.fn(fn=>fn(m.db)),
 });
});
it("funds only business with audit and idempotent replay",async()=>{
 const result=await fundReseller("USR-R","1000","request-123","Funding");
 expect(result).toMatchObject({businessCoins:"1000",personalCoins:"999"});
 expect(m.auth).toHaveBeenCalledWith("finance.adjust");
 expect(m.db.user.updateMany.mock.calls[0][0].data).toEqual({resellerCoinBalance:{increment:1000n}});
 expect(m.db.auditLog.create).toHaveBeenCalledTimes(1);
 const old=m.db.resellerRechargeRequest.create.mock.calls[0][0].data;
 m.db.resellerRechargeRequest.findUnique.mockResolvedValue(old);
 expect(await fundReseller("USR-R","1000","request-123","Funding")).toEqual(result);
 expect(m.db.user.updateMany).toHaveBeenCalledTimes(1);
 await expect(fundReseller("USR-R","2000","request-123","Funding")).rejects.toThrow("different details");
});
it("does not mutate when admin permission is denied",async()=>{
 m.auth.mockRejectedValue(new Error("FORBIDDEN"));
 await expect(fundReseller("USR-R","1000","request-123","Funding")).rejects.toThrow("FORBIDDEN");
 expect(m.db.$transaction).not.toHaveBeenCalled();
});
