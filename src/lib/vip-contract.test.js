import { describe,it,expect } from "vitest";
import { VIP_PRIVILEGES,validateVipTier,vipIsActive } from "./vip-contract";
const basic={name:"Royal",level:100,validDays:30,privileges:[],assets:[]};
describe("VIP contract",()=>{
  it("allows levels above the old fixed five tiers",()=>expect(validateVipTier(basic).level).toBe(100));
  it.each([0,-1,1.2,3651])("rejects invalid validity %s",validDays=>expect(()=>validateVipTier({...basic,validDays})).toThrow());
  it("requires artwork for selected visual privileges",()=>expect(()=>validateVipTier({...basic,privileges:["VIP_FRAME"]})).toThrow("Choose artwork"));
  it("rejects unknown capabilities",()=>expect(()=>validateVipTier({...basic,privileges:["BYPASS_PLATFORM_BAN"]})).toThrow());
  it("does not duplicate the VIP gift privilege",()=>expect(VIP_PRIVILEGES.filter(p=>p.key==="VIP_GIFTS")).toHaveLength(1));
  it("expires at the exact boundary and respects revocation and disabled tiers",()=>{
    const now=new Date("2026-10-09T00:00:00Z"),row={startsAt:new Date(now-1000),expiresAt:new Date(+now+1000),tier:{active:true}};
    expect(vipIsActive(row,now)).toBe(true);expect(vipIsActive({...row,expiresAt:now},now)).toBe(false);
    expect(vipIsActive({...row,revokedAt:now},now)).toBe(false);expect(vipIsActive({...row,tier:{active:false}},now)).toBe(false);
  });
});
