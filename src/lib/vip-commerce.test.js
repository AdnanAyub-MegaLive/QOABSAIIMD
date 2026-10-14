import { expect, it, vi } from "vitest";
import { WalletTransactionType } from "@prisma/client";
vi.mock("./prisma.js",()=>({prisma:{}}));
import { vipRenewalExpiry, changeVip } from "./vip-commerce.js";
it("uses a ledger type supported by the generated Prisma client",()=>{
 expect(WalletTransactionType.VIP_PURCHASE).toBe("VIP_PURCHASE");
});
it("extends an unexpired VIP, starts expired/revoked ownership from now",()=>{
 const now=new Date("2026-10-15T00:00:00Z"),old={expiresAt:new Date("2026-10-20T00:00:00Z")};
 expect(vipRenewalExpiry(old,30,now).toISOString()).toBe("2026-11-19T00:00:00.000Z");
 expect(vipRenewalExpiry({...old,revokedAt:now},30,now).toISOString()).toBe("2026-11-14T00:00:00.000Z");
});
it("returns the committed purchase on same-key retries without debiting",async()=>{
 const result={tierId:"tier",coinBalance:"50"};
 const tx={$queryRaw:vi.fn(),user:{findUnique:async()=>({status:"ACTIVE"}),updateMany:vi.fn()},vipPurchase:{findUnique:async()=>({tierId:"tier",result})}};
 const db={$transaction:fn=>fn(tx)};
 expect(await changeVip("u",{action:"PURCHASE",tierId:"tier",requestKey:"purchase-123"},db)).toBe(result);
 expect(tx.user.updateMany).not.toHaveBeenCalled();
 await expect(changeVip("u",{action:"PURCHASE",tierId:"other",requestKey:"purchase-123"},db)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
});
it("rejects purchases without a retry key",async()=>{
 await expect(changeVip("u",{action:"PURCHASE",tierId:"tier"},{})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
});
it("buying a different VIP retains the previous selection and debits only its configured price",async()=>{
 const updateMany=vi.fn().mockResolvedValue({count:1}),select=vi.fn();
 const tx={$queryRaw:vi.fn(),user:{findUnique:async()=>({status:"ACTIVE",coinBalance:90n}),updateMany},
  vipPurchase:{findUnique:async()=>null,create:vi.fn()},vipTier:{findUnique:async()=>({id:"new",active:true,coinPrice:10n,validDays:30,assets:[]})},
  vipOwnership:{findUnique:async()=>null,upsert:async({create})=>create},
  vipMembership:{findUnique:async()=>({tierId:"old",expiresAt:new Date(Date.now()+86400000),tier:{active:true}}),upsert:select},
  walletTransaction:{create:vi.fn()},auditLog:{create:vi.fn()}};
 const result=await changeVip("u",{action:"PURCHASE",tierId:"new",requestKey:"purchase-123"},{$transaction:fn=>fn(tx)});
 expect(result.tierId).toBe("new");expect(select).not.toHaveBeenCalled();
 expect(updateMany.mock.calls[0][0]).toMatchObject({where:{coinBalance:{gte:10n}},data:{coinBalance:{decrement:10n}}});
 expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
});
