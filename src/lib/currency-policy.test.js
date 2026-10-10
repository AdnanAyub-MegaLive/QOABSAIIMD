import { expect,it } from "vitest";
import { currencyDefaults,validateCurrencyPolicy,giftDiamonds,payoutQuote,rechargePrice } from "./currency-policy.js";
import { validTronAddress } from "./currency-operations.js";
const policy={version:1,rules:{...currencyDefaults}};
it("uses approved defaults, not the old two-Diamonds gift rate",()=>{
  expect(giftDiamonds(100n,40n,policy)).toBe(100n);
  expect(rechargePrice(45000n,policy)).toBe("1.00");
  expect(policy.rules.userDiamondsPerCoin).toBe("2");
});
it("supports post-split gift basis and integer rounding",()=>{
  expect(giftDiamonds(100n,41n,{rules:{...currencyDefaults,giftBasis:"AFTER_SPLIT",giftDiamondsNumerator:"1",giftCoinsDenominator:"2"}})).toBe(20n);
});
it("refuses unconfigured financial paths",()=>{
  for(const key of ["hostExchangeEnabled","redemptionEnabled","usdtEnabled"])expect(()=>validateCurrencyPolicy({...currencyDefaults,[key]:true})).toThrow();
  expect(()=>payoutQuote(90000n,policy)).toThrow();
});
it("quotes USDT using integer micro-units and freezes commission tier",()=>{
  const rules=validateCurrencyPolicy({...currencyDefaults,usdtEnabled:true,usdtMicrosPerUsd:"1000000",withdrawalMinDiamonds:"90000",withdrawalMaxDiamonds:"90000000",commissionChart:[{minUsdMicros:"0",bps:"100",fixedUsdtMicros:"0",networkUsdtMicros:"100000"}]});
  expect(payoutQuote(900000n,{rules})).toEqual({grossUsdMicros:"10000000",grossUsdtMicros:"10000000",commissionMicros:"100000",networkFeeMicros:"100000",netUsdtMicros:"9800000"});
  expect(payoutQuote(900000n,{rules:{...rules,feeBearer:"COMPANY"}}).netUsdtMicros).toBe("9900000");
});
it("rejects invalid rate, chart and overflow values",()=>{
  expect(()=>validateCurrencyPolicy({...currencyDefaults,giftCoinsDenominator:"0"})).toThrow();
  expect(()=>validateCurrencyPolicy({...currencyDefaults,commissionChart:[{minUsdMicros:"0",bps:"10001",fixedUsdtMicros:"0",networkUsdtMicros:"0"}]})).toThrow();
  expect(()=>validateCurrencyPolicy({...currencyDefaults,rechargeCoinsPerUsd:"9223372036854775808"})).toThrow();
});
it("validates TRON address checksum, not just its prefix",()=>{
  expect(validTronAddress("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb")).toBe(true);
  expect(validTronAddress("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwa")).toBe(false);
  expect(validTronAddress("0x1234")).toBe(false);
});
