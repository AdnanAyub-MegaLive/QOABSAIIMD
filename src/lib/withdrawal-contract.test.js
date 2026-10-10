import { it, expect, vi, afterEach } from "vitest";
import { currencyDefaults, currencyPolicy, payoutQuote } from "./currency-policy.js";
import { withdrawalAvailability, issueWithdrawalQuote, verifyWithdrawalQuote } from "./withdrawal-contract.js";
const rules={...currencyDefaults,usdtEnabled:true,usdtMicrosPerUsd:"1000000",withdrawalMinDiamonds:"90000",withdrawalMaxDiamonds:"90000000",commissionChart:[{minUsdMicros:"0",bps:"100",fixedUsdtMicros:"0",networkUsdtMicros:"1000"}]};
const policy={version:4,configured:true,rules};
const host={status:"ACTIVE",agencyId:"agency",role:"HOST",hostSalaryCoinBalance:900000n};
afterEach(()=>vi.unstubAllEnvs());
it("always exposes policy but does not fabricate missing payout rates",async()=>{
  const result=await currencyPolicy({currencyPolicy:{findUnique:async()=>null}});
  expect(result.configured).toBe(false);
  expect(result.rules.withdrawalDiamondsPerUsd).toBeNull();
  expect(withdrawalAvailability(host,result).reason.code).toBe("PAYOUT_CONFIGURATION_INCOMPLETE");
});
it("distinguishes unavailable reasons and eligible accounts",()=>{
  expect(withdrawalAvailability(host,policy).canWithdraw).toBe(true);
  expect(withdrawalAvailability({...host,agencyId:null},policy).reason.code).toBe("WITHDRAWAL_NOT_ALLOWED");
  expect(withdrawalAvailability(host,{...policy,rules:{...rules,usdtEnabled:false}}).reason.code).toBe("WITHDRAWAL_DISABLED");
  expect(withdrawalAvailability({...host,hostSalaryCoinBalance:0n},policy).reason.code).toBe("INSUFFICIENT_DIAMONDS");
  for(const key of ["withdrawalDiamondsPerUsd","usdtMicrosPerUsd","withdrawalMinDiamonds","withdrawalMaxDiamonds","feeBearer","commissionChart"]){
    const incomplete={...policy,rules:{...rules,[key]:undefined}};
    expect(withdrawalAvailability(host,incomplete).reason.code).toBe("PAYOUT_CONFIGURATION_INCOMPLETE");
    expect(()=>payoutQuote(90000n,incomplete)).toThrow();
  }
});
it("binds expiring quotes to user, amount, destination and policy",()=>{
  vi.stubEnv("AUTH_SECRET","test-secret-not-used-in-production");
  const expected={userId:"u",diamonds:"90000",destination:"address",policyVersion:4};
  const {quoteToken}=issueWithdrawalQuote(expected,1000);
  expect(()=>verifyWithdrawalQuote(quoteToken,expected,2000)).not.toThrow();
  for(const change of [{userId:"v"},{diamonds:"90001"},{destination:"other"},{policyVersion:5}])expect(()=>verifyWithdrawalQuote(quoteToken,{...expected,...change},2000)).toThrow();
  expect(()=>verifyWithdrawalQuote(quoteToken,expected,601001)).toThrow();
  expect(()=>verifyWithdrawalQuote(quoteToken+"tampered",expected,2000)).toThrow();
});
