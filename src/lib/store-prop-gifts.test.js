import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./props-store.js',()=>({equippablePropCategories:new Set(['FRAMES','ROOM_FRAMES']),entitlementExpiry:(asset,now)=>asset.defaultGrantDurationMinutes?new Date(now.getTime()+asset.defaultGrantDurationMinutes*60000):null}));
import {giftStoreProp,propGiftInput} from './store-prop-gifts.js';
let state,db;
const input={recipientPublicId:'USR-R',requestId:'request-1'},session={id:'s',sessionVersion:1};
beforeEach(()=>{
 state={users:[{id:'s',publicId:'USR-S',name:'Sender',status:'ACTIVE',sessionVersion:1,coinBalance:100n,totalSpent:0n},{id:'r',publicId:'USR-R',name:'Recipient',status:'ACTIVE',sessionVersion:1,coinBalance:5n}],assignments:[],gifts:[],ledger:[],notifications:[],outbox:[],audit:[],blocked:false,asset:{id:'asset',publicId:'AST-1',name:'Frame',category:'FRAMES',coinPrice:40n,defaultGrantDurationMinutes:60}};
 const tx={
 user:{findUnique:async({where})=>state.users.find(u=>where.id?u.id===where.id:u.publicId===where.publicId)??null,findUniqueOrThrow:async({where})=>state.users.find(u=>u.id===where.id),updateMany:async({where})=>{const u=state.users.find(u=>u.id===where.id);if(u.coinBalance<where.coinBalance.gte)return {count:0};u.coinBalance-=where.coinBalance.gte;u.totalSpent+=where.coinBalance.gte;return {count:1};}},
 propGift:{findUnique:async({where})=>state.gifts.find(g=>g.senderUserId===where.senderUserId_requestId.senderUserId&&g.requestId===where.senderUserId_requestId.requestId),create:async({data})=>state.gifts.push(data)},
 userBlock:{findFirst:async()=>state.blocked?{}:null},uploadAsset:{findFirst:async()=>state.asset},
 uploadAssetAssignment:{findUnique:async({where})=>state.assignments.find(a=>a.userId===where.assetId_userId.userId&&a.assetId===where.assetId_userId.assetId),upsert:async({create,update})=>{const a=state.assignments.find(a=>a.userId===create.userId&&a.assetId===create.assetId);if(a)Object.assign(a,update);else state.assignments.push(create);}},
 walletTransaction:{create:async({data})=>state.ledger.push(data)},notification:{upsert:async({create})=>state.notifications.push(create)},realtimeOutbox:{create:async({data})=>state.outbox.push(data)},auditLog:{create:async({data})=>state.audit.push(data)},
 };
 db={$transaction:vi.fn(async fn=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}}),tx};
});
it('debits once, grants recipient only and records both ledgers, notification and outbox',async()=>{
 const result=await giftStoreProp(db,session,'AST-1',input);
 expect(result).toMatchObject({price:'40',balance:'60',recipientPublicId:'USR-R',permanent:false});
 expect(state.users[1].coinBalance).toBe(5n);
 expect(state.assignments).toHaveLength(1);expect(state.assignments[0]).toMatchObject({userId:'r',giftedByUserId:'s',source:'GIFT',sourceReference:result.giftId});
 expect(state.ledger.map(l=>[l.type,l.coins])).toEqual([['STORE_GIFT_SENT',40n],['STORE_GIFT_RECEIVED',0n]]);
 expect(state.notifications).toHaveLength(1);expect(state.outbox[0]).toMatchObject({event:'props:granted',channel:'user:USR-R'});
 expect(await giftStoreProp(db,session,'AST-1',input)).toEqual(result);expect(state.users[0].coinBalance).toBe(60n);expect(state.ledger).toHaveLength(2);
});
it('rejects conflicting replay without debit',async()=>{
 await giftStoreProp(db,session,'AST-1',input);
 await expect(giftStoreProp(db,session,'AST-2',input)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 expect(state.users[0].coinBalance).toBe(60n);
});
it('excludes archived props before any debit or entitlement writes',async()=>{
 db.tx.uploadAsset.findFirst=vi.fn(async({where})=>where.archivedAt===null?null:state.asset);
 await expect(giftStoreProp(db,session,'AST-1',input)).rejects.toMatchObject({code:'STORE_ITEM_NOT_FOUND'});
 expect(state.users[0].coinBalance).toBe(100n);
 expect(state.ledger).toHaveLength(0);
 expect(state.assignments).toHaveLength(0);
});
it.each(['self','missing','banned','deleted','blocked','owned','insufficient','unavailable'])('rejects %s without financial changes',async kind=>{
 let body=input,code;
 if(kind==='self'){body={...input,recipientPublicId:'USR-S'};code='CANNOT_GIFT_SELF';}
 if(kind==='missing'){body={...input,recipientPublicId:'USR-X'};code='RECIPIENT_NOT_FOUND';}
 if(kind==='banned'){state.users[1].status='BANNED';code='RECIPIENT_NOT_FOUND';}
 if(kind==='deleted'){state.users[1].deletedAt=new Date();code='RECIPIENT_NOT_FOUND';}
 if(kind==='blocked'){state.blocked=true;code='RECIPIENT_UNAVAILABLE';}
 if(kind==='owned'){state.assignments.push({userId:'r',assetId:'asset',expiresAt:null});code='PROP_ALREADY_OWNED_BY_RECIPIENT';}
 if(kind==='insufficient'){state.users[0].coinBalance=1n;code='INSUFFICIENT_COINS';}
 if(kind==='unavailable'){state.asset=null;code='STORE_ITEM_NOT_FOUND';}
 const before=state.users[0].coinBalance;
 await expect(giftStoreProp(db,session,'AST-1',body)).rejects.toMatchObject({code});expect(state.users[0].coinBalance).toBe(before);expect(state.ledger).toHaveLength(0);
});
it('preserves sender ownership and replaces only expired recipient ownership',async()=>{
 state.assignments=[{userId:'s',assetId:'asset',source:'ADMIN',expiresAt:null},{userId:'r',assetId:'asset',source:'STORE',expiresAt:new Date(0)}];
 const own=structuredClone(state.assignments[0]);state.asset.defaultGrantDurationMinutes=null;
 expect((await giftStoreProp(db,session,'AST-1',input)).permanent).toBe(true);expect(state.assignments[0]).toEqual(own);expect(state.assignments[1].source).toBe('GIFT');
});
it('rolls back entitlement and debit if ledger writing fails',async()=>{
 db.tx.walletTransaction.create=async()=>{throw new Error('ledger failed');};
 await expect(giftStoreProp(db,session,'AST-1',input)).rejects.toThrow('ledger failed');
 expect(state.users[0].coinBalance).toBe(100n);expect(state.assignments).toEqual([]);expect(state.gifts).toEqual([]);
});
it('retries serialization conflicts using the same request',async()=>{
 db.$transaction.mockRejectedValueOnce(Object.assign(new Error('retry'),{code:'P2034'}));
 await giftStoreProp(db,session,'AST-1',input);expect(db.$transaction).toHaveBeenCalledTimes(2);expect(state.ledger).toHaveLength(2);
});
it('requires a stable explicit request ID',()=>{expect(()=>propGiftInput('AST-1',{recipientPublicId:'USR-R'})).toThrow('stable requestId');});
