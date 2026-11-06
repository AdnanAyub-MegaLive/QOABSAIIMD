import {expect,it} from "vitest";
import {calculateGiftSettlement,assertGiftRecipient} from "./gift-currency-settlement.js";
const split={hostShareBps:4000,agencyShareBps:2000,normalUserReusableShareBps:1000};
const currency={version:9,rules:{giftBasis:"GROSS",giftDiamondsNumerator:"3",giftCoinsDenominator:"2"}};
it.each([true,false])("credits configured Diamonds for host=%s",host=>{
 expect(calculateGiftSettlement(101n,host,split,currency).receivedDiamonds).toBe(host?101n:50n);
});
it("uses after-split valuation and caps lucky rewards without reducing recipient credit",()=>{
 const result=calculateGiftSettlement(100n,true,split,{...currency,rules:{...currency.rules,giftBasis:"AFTER_SPLIT"}},999n);
 expect(result).toMatchObject({receivedDiamonds:100n,luckyRewardCoins:40n,companyCoins:0n,agencyCoins:20n});
});
it("rejects unavailable recipients and changed membership",async()=>{
 await expect(assertGiftRecipient({user:{findFirst:async()=>null}},{id:"u"})).rejects.toMatchObject({code:"USER_NOT_FOUND"});
 await expect(assertGiftRecipient({user:{findFirst:async()=>({agencyId:"new",appRoles:["HOST"]})}},{id:"u",agencyId:"old",appRoles:["HOST"]})).rejects.toMatchObject({code:"GIFT_RECIPIENT_CHANGED"});
});
it("credits the full host gift independently of its legacy per-gift override",()=>{
 const result=calculateGiftSettlement(100n,true,split,{...currency,rules:{...currency.rules,giftDiamondsNumerator:"1",giftCoinsDenominator:"1"}},0n,{fixedDiamonds:30n});
 expect(result).toMatchObject({receivedDiamonds:100n,hostSalaryCoins:40n,agencyCoins:20n,companyCoins:40n});
});
it("never credits more than gross gift value",()=>{
 const result=calculateGiftSettlement(100n,true,split,{...currency,rules:{...currency.rules,giftDiamondsNumerator:"1",giftCoinsDenominator:"1"}},0n,{fixedDiamonds:500n});
 expect(result).toMatchObject({receivedDiamonds:100n,hostSalaryCoins:40n,agencyCoins:20n,companyCoins:40n});
});
it("moves the lucky pool share out of the company share",()=>{
 const result=calculateGiftSettlement(100n,true,split,currency,0n,{luckyPoolBps:3000});
 expect(result).toMatchObject({luckyPoolCoins:30n,companyCoins:10n,luckyRewardCoins:0n});
});
