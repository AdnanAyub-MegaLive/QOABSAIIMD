import {expect,it} from "vitest";
import {calculateGiftSettlement,assertGiftRecipient} from "./gift-currency-settlement.js";
const split={hostShareBps:4000,agencyShareBps:2000,normalUserReusableShareBps:1000};
const currency={version:9,rules:{giftBasis:"GROSS",giftDiamondsNumerator:"3",giftCoinsDenominator:"2"}};
it.each([true,false])("credits configured Diamonds for host=%s",host=>{
 expect(calculateGiftSettlement(101n,host,split,currency).receivedDiamonds).toBe(151n);
});
it("uses after-split valuation and caps lucky rewards without reducing recipient credit",()=>{
 const result=calculateGiftSettlement(100n,true,split,{...currency,rules:{...currency.rules,giftBasis:"AFTER_SPLIT"}},999n);
 expect(result).toMatchObject({receivedDiamonds:60n,luckyRewardCoins:40n,companyCoins:0n,agencyCoins:20n});
});
it("rejects unavailable recipients and changed membership",async()=>{
 await expect(assertGiftRecipient({user:{findFirst:async()=>null}},{id:"u"})).rejects.toMatchObject({code:"USER_NOT_FOUND"});
 await expect(assertGiftRecipient({user:{findFirst:async()=>({agencyId:"new",appRoles:["HOST"]})}},{id:"u",agencyId:"old",appRoles:["HOST"]})).rejects.toMatchObject({code:"GIFT_RECIPIENT_CHANGED"});
});
it("credits the gift's fixed host Diamonds and keeps the rest for agency and company",()=>{
 const result=calculateGiftSettlement(100n,true,split,{...currency,rules:{...currency.rules,giftDiamondsNumerator:"1",giftCoinsDenominator:"1"}},0n,{fixedDiamonds:30n});
 expect(result).toMatchObject({receivedDiamonds:30n,hostSalaryCoins:30n,agencyCoins:20n,companyCoins:50n});
});
it("caps fixed host Diamonds at what the gift value can cover",()=>{
 const result=calculateGiftSettlement(100n,true,split,{...currency,rules:{...currency.rules,giftDiamondsNumerator:"1",giftCoinsDenominator:"1"}},0n,{fixedDiamonds:500n});
 expect(result).toMatchObject({receivedDiamonds:80n,hostSalaryCoins:80n,agencyCoins:20n,companyCoins:0n});
});
it("moves the lucky pool share out of the company share",()=>{
 const result=calculateGiftSettlement(100n,true,split,currency,0n,{luckyPoolBps:3000});
 expect(result).toMatchObject({luckyPoolCoins:30n,companyCoins:10n,luckyRewardCoins:0n});
});
