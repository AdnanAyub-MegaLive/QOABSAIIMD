import { it, expect, vi } from "vitest";
import { createCurrencyRequest, reviewCurrencyRequest } from "./currency-operations.js";
vi.mock("./reseller-redemption.js",()=>({redeemableHostDiamonds:async()=>90000n,redemptionCoins:()=>50000n}));
function database(kind="REDEMPTION") {
 let row={id:"request",userId:"user",kind,status:"PENDING",diamonds:90000n,quotedCoins:50000n};
 const tx={
  currencyRequest:{findUnique:vi.fn(async()=>null),findUniqueOrThrow:async()=>row,create:async({data})=>(row={...row,...data}),update:async({data})=>(row={...row,...data})},
  user:{findUniqueOrThrow:async()=>({id:"user",publicId:"USR-QA",status:"ACTIVE",appRoles:["RESELLER"]}),updateMany:vi.fn(async()=>({count:1}))},
  currencyPolicy:{findUnique:async()=>({version:1,rules:{redemptionEnabled:true}})},
  walletTransaction:{create:vi.fn()},auditLog:{create:vi.fn()},notification:{upsert:vi.fn()}
 };
 return {...tx,$transaction:fn=>fn(tx)};
}
it("labels redemption reservation as exchange and carries kind",async()=>{
 const db=database();await createCurrencyRequest(db,"user",{kind:"REDEMPTION",diamonds:"90000"},"exchange-test-key");
 expect(db.walletTransaction.create).toHaveBeenCalledWith({data:expect.objectContaining({type:"DIAMOND_EXCHANGE_DEBIT",title:"Diamonds held for Coin exchange"})});
 expect(db.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({title:"Exchange request submitted",body:"90000 Diamonds are held while your Diamonds → Coins exchange is reviewed.",action:{screen:"WALLET",requestId:"request",kind:"REDEMPTION"}})}));
});
it.each(["APPROVE","REJECT"])("uses exchange wording for %s",async action=>{
 const db=database();await reviewCurrencyRequest(db,{id:"admin"},"request",action,"Reviewed");
 expect(db.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({title:action==="APPROVE"?"Exchange approved":"Exchange rejected",body:action==="APPROVE"?"50000 Coins added to your wallet.":"90000 Diamonds returned. Reviewed",action:{screen:"WALLET",requestId:"request",kind:"REDEMPTION"}})}));
});
it("keeps USDT approval distinct from exchange",async()=>{
 const db=database("USDT");await reviewCurrencyRequest(db,{id:"admin"},"request","APPROVE","Reviewed");
 expect(db.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({title:"Withdrawal approved",action:{screen:"WALLET",requestId:"request",kind:"USDT"}})}));
 expect(db.user.updateMany).not.toHaveBeenCalled();
});
