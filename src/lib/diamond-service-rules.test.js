import { it, expect } from "vitest";
import { diamondRules, validateServiceAmount, checkDiamondLimits, eligibleResellerWhere } from "./diamond-service-rules";
const policy = { configured:true, version:3, rules:{hostTransferEnabled:true,transferMinDiamonds:"10",transferMaxDiamonds:"100",transferMultiple:"5",transferDailyLimit:"200",transferMonthlyLimit:"500"} };
const user = { id:"u",country:"PK",status:"ACTIVE",agencyId:"a",appRoles:["HOST"] };
it("requires explicit complete policy and eligible account",()=>{
  expect(diamondRules(policy,user,"TRANSFER")).toMatchObject({enabled:true,feeDiamonds:"0",feeBps:0});
  expect(diamondRules({...policy,rules:{}},user,"TRANSFER").enabled).toBe(false);
  expect(diamondRules(policy,{...user,country:null},"TRANSFER").enabled).toBe(false);
  expect(diamondRules(policy,{...user,agencyId:null},"TRANSFER").enabled).toBe(true);
  expect(diamondRules(policy,{...user,appRoles:["LISTENER"]},"TRANSFER").enabled).toBe(false);
});
it("validates minimum maximum and multiple",()=>{
  const rules=diamondRules(policy,user,"TRANSFER");
  for(const value of [5n,101n,12n])expect(()=>validateServiceAmount(value,rules,"TRANSFER")).toThrow();
  expect(()=>validateServiceAmount(50n,rules,"TRANSFER")).not.toThrow();
});
it("uses immutable debits for period caps",async()=>{
  const tx={walletTransaction:{aggregate:async()=>({_sum:{diamonds:190n}})}};
  await expect(checkDiamondLimits(tx,"u",20n,diamondRules(policy,user,"TRANSFER"),"TRANSFER")).rejects.toMatchObject({code:"TRANSFER_DAILY_LIMIT"});
});
it("filters using account country, bans and self exclusion",()=>{
  expect(eligibleResellerWhere(user)).toMatchObject({id:{not:"u"},country:"PK",status:"ACTIVE",deletedAt:null,appRoles:{has:"RESELLER"}});
  expect(eligibleResellerWhere(user).bans.none.target).toBe("USER");
});
