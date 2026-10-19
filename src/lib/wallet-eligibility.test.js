import { expect, it } from "vitest";
import { walletEligibility } from "./wallet-eligibility.js";
import { diamondRules } from "./diamond-service-rules.js";
import { withdrawalAvailability } from "./withdrawal-contract.js";

const policy = { configured:true, version:1, rules:{
  userExchangeEnabled:true,hostExchangeEnabled:true,hostTransferEnabled:true,
  userDiamondsPerCoin:"2",hostDiamondsPerCoin:"3",usdtEnabled:true,
  withdrawalDiamondsPerUsd:"90000",usdtMicrosPerUsd:"1000000",
  withdrawalMinDiamonds:"1",withdrawalMaxDiamonds:"1000000",feeBearer:"HOST",
  commissionChart:[{minUsdMicros:"0",bps:"0",fixedUsdtMicros:"0",networkUsdtMicros:"0"}],
  ...Object.fromEntries(["transfer","exchange"].flatMap(prefix => ["MinDiamonds","MaxDiamonds","Multiple","DailyLimit","MonthlyLimit"].map(suffix => [prefix+suffix,"10"]))),
}};
const ordinary = {status:"ACTIVE",country:"PK",role:"LISTENER",diamondExchangeEnabled:true,hostSalaryCoinBalance:100n};
const cases = [
  [[],true,false],[["LISTENER","SENDER"],true,false],
  ...["CS","CS_LEADER"].flatMap(role=>[[[role],true,false],[[role,"RESELLER","HOST","ADMIN"],true,false]]),
  ...["HOST","CREATOR","MODERATOR","OFFICIAL","BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD","MANAGER"].map(role=>[[role],true,true]),
  [["RESELLER"],false,true],[["RESELLER","ADMIN","HOST"],false,true],
];
it.each(cases)("wallet response and shared eligibility agree for roles %j",(appRoles,exchange,cashOut)=>{
  const user={...ordinary,appRoles};
  expect(walletEligibility(user)).toEqual({exchange,transfer:cashOut,withdraw:cashOut});
  expect(diamondRules(policy,user,"EXCHANGE").enabled).toBe(exchange);
  expect(diamondRules(policy,user,"TRANSFER").enabled).toBe(cashOut);
  expect(withdrawalAvailability(user,policy).canWithdraw).toBe(cashOut);
});
it("uses active agency ownership, not mere membership or a Diamond balance",()=>{
  expect(walletEligibility({...ordinary,agencyId:"a"}).withdraw).toBe(false);
  expect(walletEligibility({...ordinary,ownedAgencies:[{status:"ACTIVE"}]}).withdraw).toBe(true);
  expect(walletEligibility({...ordinary,ownedAgencies:[{status:"INACTIVE"}]}).withdraw).toBe(false);
  expect(walletEligibility({...ordinary,ownedAgencies:[{status:"ACTIVE"}],appRoles:["CS"]}).withdraw).toBe(false);
});
it("denies inactive/deleted accounts and retains configured service switches",()=>{
  for(const change of [{status:"BANNED"},{status:"SUSPENDED"},{deletedAt:new Date()}]) {
    expect(walletEligibility({...ordinary,appRoles:["ADMIN"],...change})).toEqual({exchange:false,transfer:false,withdraw:false});
  }
  expect(diamondRules(policy,{...ordinary,appRoles:["CS","RESELLER"],diamondExchangeEnabled:false},"EXCHANGE").enabled).toBe(false);
  expect(diamondRules({...policy,rules:{...policy.rules,hostTransferEnabled:false}},{...ordinary,appRoles:["ADMIN"]},"TRANSFER").enabled).toBe(false);
});
