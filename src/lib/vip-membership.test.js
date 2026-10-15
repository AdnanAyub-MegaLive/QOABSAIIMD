import { expect, it, vi } from "vitest";
vi.mock("./prisma.js",()=>({prisma:{}}));
vi.mock("./props-store.js",()=>({syncProgressionProps:vi.fn()}));
import { syncProgressionProps } from "./props-store.js";
import { synchronizeVip } from "./vip-membership.js";

it.each(["active","expired","revoked","disabled"])("syncs level rewards atomically for %s membership",async state=>{
 const membership={tier:{active:state!=="disabled",level:1,assets:[]},startsAt:new Date(0),expiresAt:new Date(Date.now()+(state==="expired"?-1000:86400000)),revokedAt:state==="revoked"?new Date():null};
 const tx={$queryRaw:vi.fn(),vipMembership:{findUnique:async()=>membership},user:{updateMany:vi.fn()},uploadAssetAssignment:{deleteMany:vi.fn()}};
 const client={vipMembership:{findUnique:async()=>({userId:"u"})},$transaction:fn=>fn(tx)};
 expect(await synchronizeVip("u",client)).toBe(state==="active"?1:0);
 expect(syncProgressionProps).toHaveBeenCalledWith("u",tx);
 expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{vipLevel:state==="active"?1:0}}));
});
