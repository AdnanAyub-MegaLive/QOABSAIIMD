import {describe,it,expect,vi} from 'vitest';
vi.mock('./wallet.js',()=>({ledgerData:data=>data}));
import {purchaseBackpack} from './backpack-purchase.js';
function database(){
 const state={balance:100n,quantity:0,ledger:new Map(),active:true,failLedger:false};
 const tx={
  $queryRaw:vi.fn(async()=>[]),
  uploadAsset:{findFirst:vi.fn(async()=>state.active?{id:'asset',publicId:'gift',name:'Rose',coinPrice:10n}:null)},
  user:{updateMany:vi.fn(async({data})=>{const cost=data.coinBalance.decrement;if(state.balance<cost)return {count:0};state.balance-=cost;return {count:1};})},
  userGiftInventory:{upsert:vi.fn(async({create})=>({quantity:state.quantity+=create.quantity}))},
  walletTransaction:{findUnique:vi.fn(async({where})=>state.ledger.get(where.userId_type_referenceId.referenceId)),create:vi.fn(async({data})=>{if(state.failLedger)throw new Error('ledger unavailable');state.ledger.set(data.referenceId,data);return data;})}
 };
 let tail=Promise.resolve();
 const db={walletTransaction:tx.walletTransaction,$transaction:fn=>{const run=tail.then(async()=>{const balance=state.balance,quantity=state.quantity;try{return await fn(tx);}catch(e){state.balance=balance;state.quantity=quantity;throw e;}});tail=run.catch(()=>{});return run;}};
 return {db,state,tx};
}
const user={id:'user',publicId:'USR-1'},input={giftId:'gift',quantity:10,requestKey:'purchase-key-1'};
describe('backpack purchase retries',()=>{
 it('replays concurrent duplicate requests once, including after the balance reaches zero',async()=>{
  const {db,state,tx}=database();const results=await Promise.all(Array.from({length:6},()=>purchaseBackpack(db,user,input)));
  expect(results.every(r=>JSON.stringify(r)===JSON.stringify(results[0]))).toBe(true);
  expect(state.balance).toBe(0n);expect(state.quantity).toBe(10);expect(state.ledger.size).toBe(1);expect(tx.user.updateMany).toHaveBeenCalledTimes(1);
 });
 it('replays the original receipt after gift removal, without checking its current price',async()=>{
  const {db,state,tx}=database();const first=await purchaseBackpack(db,user,input);state.active=false;
  expect(await purchaseBackpack(db,user,input)).toEqual(first);expect(tx.uploadAsset.findFirst).toHaveBeenCalledTimes(1);
 });
 it('rejects a reused key with a different payload',async()=>{
  const {db,state}=database();await purchaseBackpack(db,user,input);
  await expect(purchaseBackpack(db,user,{...input,quantity:1})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(state.quantity).toBe(10);
 });
 it('fails closed without a key before any debit',async()=>{
  const {db,tx}=database();await expect(purchaseBackpack(db,user,{...input,requestKey:null})).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_REQUIRED'});expect(tx.user.updateMany).not.toHaveBeenCalled();
 });
 it('rolls back debit and inventory when the receipt cannot be persisted, then retries successfully',async()=>{
  const {db,state}=database();state.failLedger=true;await expect(purchaseBackpack(db,user,input)).rejects.toThrow('ledger unavailable');expect(state.balance).toBe(100n);expect(state.quantity).toBe(0);
  state.failLedger=false;await purchaseBackpack(db,user,input);expect(state.quantity).toBe(10);expect(state.balance).toBe(0n);
 });
 it('allows a new deliberate purchase under a new key',async()=>{
  const {db,state}=database();await purchaseBackpack(db,user,{...input,quantity:1});await purchaseBackpack(db,user,{...input,quantity:1,requestKey:'purchase-key-2'});expect(state.quantity).toBe(2);expect(state.balance).toBe(80n);
 });
});
