import { describe, expect, it, vi } from "vitest";
import { billingAccountId, creditGoogleRecharge } from "./google-recharge.js";
function setup() {
  const receipts=new Map();
  const db={
    googleRechargeReceipt:{
      findUnique:async({where})=>receipts.get(where.tokenHash),
      findUniqueOrThrow:async({where})=>receipts.get(where.tokenHash),
      createMany:async({data:[row]})=>{
        if(receipts.has(row.tokenHash)) return {count:0};
        receipts.set(row.tokenHash,row);
        return {count:1};
      },
    },
    googleRechargeProduct:{findUnique:async()=>({coins:42000n,active:false})},
    walletTransaction:{create:vi.fn()}, user:{updateMany:vi.fn(async()=>({count:1}))},
    $transaction:work=>work(db),
  };
  const input={productId:"payment_07",purchaseToken:"test-token"};
  const purchase={purchaseState:0,consumptionState:0,obfuscatedExternalAccountId:billingAccountId("alice"),quantity:2};
  return {db,input,purchase};
}
describe("Google Play recharge",()=>{
  it("delivers verified quantity once, including concurrent submissions and a later replay",async()=>{
    const {db,input,purchase}=setup();
    const verify=vi.fn(async()=>purchase);
    const credit=()=>creditGoogleRecharge(db,"alice",input,verify);
    expect(await Promise.all([credit(),credit()])).toEqual(Array(2).fill({productId:"payment_07",creditedCoins:"84000",quantity:2,consume:true}));
    await credit();
    expect(db.walletTransaction.create).toHaveBeenCalledTimes(1);
    expect(db.user.updateMany).toHaveBeenCalledTimes(1);
    await expect(creditGoogleRecharge(db,"bob",input,verify)).rejects.toMatchObject({code:"PURCHASE_MISMATCH"});
  });
  it.each([{purchaseState:2},{purchaseState:1},{consumptionState:1},{obfuscatedExternalAccountId:"wrong"},{quantity:0},{productId:"payment_11"}])("refuses invalid or unfinished purchase %j",async change=>{
    const {db,input,purchase}=setup();
    await expect(creditGoogleRecharge(db,"alice",input,async()=>({...purchase,...change}))).rejects.toThrow();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});