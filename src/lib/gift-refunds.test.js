import { it, expect, vi } from "vitest";
vi.mock("./gift-xp-reversal.js",()=>({reverseGiftXp:vi.fn(async()=>({reversed:2}))}));
import { previewGiftRefund, refundGift } from "./gift-refunds.js";
function fixture(overrides={}){
 const plan={version:1,source:"COINS",senderId:"s",recipientId:"r",coins:"100",diamonds:"100",agencyId:"a",agencyCoins:"10",luckyCoins:"20",giftAssetId:"gift",quantity:2,rewardAssetId:"reward",...overrides};
 let state={users:{s:{coinBalance:20n,totalSpent:100n},r:{hostSalaryCoinBalance:100n}},agency:10n,inventory:2,refund:null,gift:{id:"g",senderId:"s",createdAt:new Date(),reversedAt:null},ledger:[]};let saved;
 const tx={
  giftTransaction:{findUnique:async()=>state.gift,update:async({data})=>Object.assign(state.gift,data)},
  giftRecoverySnapshot:{findUnique:async()=>({data:plan})},
  giftRefund:{findUnique:async()=>state.refund,create:async({data})=>state.refund=data},
  dailyTaskInstance:{findFirst:async()=>null},
  user:{updateMany:async({where,data})=>{const field=Object.keys(data)[0],n=data[field].decrement,row=state.users[where.id];if(!row||row[field]<n)return {count:0};row[field]-=n;return {count:1};},update:async({where,data})=>{state.users[where.id].coinBalance+=data.coinBalance.increment;},findMany:async()=>[{publicId:"USR-S"},{publicId:"USR-R"}]},
  agency:{updateMany:async({data})=>{const n=data.commissionCoinBalance.decrement;if(state.agency<n)return {count:0};state.agency-=n;return {count:1};}},
  userGiftInventory:{updateMany:async({data})=>{if(state.inventory<data.quantity.decrement)return {count:0};state.inventory-=data.quantity.decrement;return {count:1};},upsert:async({update})=>{state.inventory+=update.quantity.increment;}},
  walletTransaction:{create:async({data})=>state.ledger.push(data)},auditLog:{create:vi.fn()},realtimeOutbox:{create:async()=>({id:"event"})},
  $executeRawUnsafe:async sql=>{if(sql.startsWith("SAVEPOINT"))saved=structuredClone(state);else state=structuredClone(saved);},
 };
 const db={...tx,$transaction:async fn=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}}};
 return {db,tx,get:()=>state,plan};
}
async function execute(f){const p=await previewGiftRefund("g",f.db);return refundGift({giftId:"g",confirmation:p.confirmation,reason:"Requested test refund",adminId:"admin"},f.db);}
it("recovers Diamonds, commission, lucky Coins and items before refund; retry is idempotent",async()=>{
 const f=fixture();expect((await execute(f)).status).toBe("REFUNDED");await execute(f);
 expect(f.get().users.s.coinBalance).toBe(100n);expect(f.get().users.r.hostSalaryCoinBalance).toBe(0n);expect(f.get().agency).toBe(0n);expect(f.get().inventory).toBe(0);expect(f.get().ledger).toHaveLength(3);
});
it("rolls back early recovery if blind-box items are spent and queues review",async()=>{
 const f=fixture();f.get().inventory=0;
 expect((await execute(f)).status).toBe("MANUAL_REVIEW");
 expect(f.get().users.r.hostSalaryCoinBalance).toBe(100n);expect(f.get().agency).toBe(10n);expect(f.get().users.s.coinBalance).toBe(20n);expect(f.get().ledger).toHaveLength(0);expect(f.get().gift.reversedAt).toBeNull();
});
it("restores backpack quantity instead of issuing Coin refund",async()=>{
 const f=fixture({source:"BACKPACK",rewardAssetId:null,luckyCoins:"0"});expect((await execute(f)).status).toBe("REFUNDED");expect(f.get().inventory).toBe(4);expect(f.get().users.s.coinBalance).toBe(20n);expect(f.get().users.s.totalSpent).toBe(100n);
});
it("never refunds historical records without recovery snapshots",async()=>{
 const f=fixture();f.tx.giftRecoverySnapshot.findUnique=async()=>null;
 expect((await execute(f)).status).toBe("MANUAL_REVIEW");expect(f.get().ledger).toHaveLength(0);
});
it("requires the preview confirmation and rejects missing reason",async()=>{
 const f=fixture();await expect(refundGift({giftId:"g",confirmation:"wrong",reason:"test",adminId:"admin"},f.db)).rejects.toThrow("Preview changed");
 await expect(refundGift({giftId:"g",reason:"",adminId:"admin"},f.db)).rejects.toThrow("refund reason");expect(f.get().refund).toBeNull();
});
it("rolls back when recipient Diamonds or agency commission cannot be recovered",async()=>{
 for(const target of ["recipient","agency","lucky"]){
  const f=fixture();
  if(target==="recipient")f.get().users.r.hostSalaryCoinBalance=0n;
  if(target==="agency")f.get().agency=0n;
  if(target==="lucky")f.get().users.s.coinBalance=0n;
  const before=structuredClone(f.get());
  expect((await execute(f)).status).toBe("MANUAL_REVIEW");
  expect(f.get().users).toEqual(before.users);expect(f.get().agency).toEqual(before.agency);expect(f.get().ledger).toHaveLength(0);
 }
});
it("queues live/PK and already claimed gift-task rewards for review without debits",async()=>{
 const f=fixture({manualReason:"PK outcome requires review"});expect((await execute(f)).status).toBe("MANUAL_REVIEW");expect(f.get().ledger).toHaveLength(0);
 const task=fixture();task.tx.dailyTaskInstance.findFirst=async()=>({id:"claimed"});expect((await execute(task)).status).toBe("MANUAL_REVIEW");expect(task.get().ledger).toHaveLength(0);
});
