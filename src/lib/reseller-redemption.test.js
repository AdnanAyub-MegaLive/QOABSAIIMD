import { expect, it } from "vitest";
import { redemptionCoins, redeemableHostDiamonds } from "./reseller-redemption.js";
it("supports exact 9:5 conversion and rounds fractional Coins down",()=>{
 const rules={redemptionDiamondsPerCoin:"9",redemptionCoinsNumerator:"5",redemptionDeductionBps:"0"};
 expect(redemptionCoins(90000n,rules)).toBe(50000n);
 expect(redemptionCoins(10n,rules)).toBe(5n);
 expect(redemptionCoins(90n,{redemptionDiamondsPerCoin:"2",redemptionDeductionBps:"0"})).toBe(45n);
});
it("excludes unverified credits and subtracts all spending before restoring verified refunds",async()=>{
 const rows=[
 {direction:"CREDIT",type:"TRANSFER_RECEIVED",diamonds:500n,metadata:{}},
 {direction:"CREDIT",type:"TRANSFER_RECEIVED",diamonds:90n,metadata:{verifiedHostTransfer:true}},
 {direction:"DEBIT",diamonds:40n},
 {direction:"CREDIT",type:"REFUND",diamonds:10n,metadata:{restoredHostDiamonds:"10"}},
 {direction:"CREDIT",type:"GIFT_RECEIVED",diamonds:1000n},
 ];
 expect(await redeemableHostDiamonds({walletTransaction:{findMany:async()=>rows}},"u")).toBe(60n);
});
