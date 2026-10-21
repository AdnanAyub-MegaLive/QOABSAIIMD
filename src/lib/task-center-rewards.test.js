import { expect,it,vi } from "vitest";
vi.mock("./vip-commerce.js",()=>({selectOwnedVip:vi.fn(),vipRenewalExpiry:(old,days,now)=>new Date(Math.max(old?.revokedAt?0:old?.expiresAt?.getTime()??0,now.getTime())+days*86400000)}));
import { grantTaskReward } from "./task-center-rewards.js";
import { selectOwnedVip } from "./vip-commerce.js";
const now=new Date("2026-10-21T12:00:00Z");
it("extends temporary props without removing their existing source",async()=>{
 const upsert=vi.fn();const db={uploadAsset:{findFirst:async()=>({id:"a"}),findUnique:async()=>({id:"a"})},uploadAssetAssignment:{findUnique:async()=>({source:"STORE",expiresAt:new Date("2026-10-22T12:00:00Z")}),upsert}};
 expect(await grantTaskReward(db,"u",{kind:"PROP",id:"AST-a",days:3},"task",now)).toBe(0n);
 expect(upsert.mock.calls[0][0].update).toEqual({expiresAt:new Date("2026-10-25T12:00:00Z")});
});
it("does not replace permanent prop ownership with temporary ownership",async()=>{
 const upsert=vi.fn();const db={uploadAsset:{findFirst:async()=>({id:"a"}),findUnique:async()=>({id:"a"})},uploadAssetAssignment:{findUnique:async()=>({expiresAt:null}),upsert}};
 await grantTaskReward(db,"u",{kind:"PROP",id:"AST-a",days:3},"task",now);expect(upsert).not.toHaveBeenCalled();
});
it("grants VIP ownership without replacing another currently selected VIP",async()=>{
 vi.mocked(selectOwnedVip).mockClear();const upsert=vi.fn(async({create})=>create);
 const db={vipTier:{findFirst:async()=>({id:"vip"}),findUnique:async()=>({id:"vip",active:true,assets:[]})},vipOwnership:{findUnique:async()=>null,upsert},vipMembership:{findUnique:async()=>({tierId:"other",expiresAt:new Date("2026-11-01")})}};
 await grantTaskReward(db,"u",{kind:"VIP",id:"vip",days:7},"task",now);
 expect(upsert.mock.calls[0][0].create.expiresAt).toEqual(new Date("2026-10-28T12:00:00Z"));expect(selectOwnedVip).not.toHaveBeenCalled();
});
