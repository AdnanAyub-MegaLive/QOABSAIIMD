import {it,expect,vi} from 'vitest';
vi.mock('./prisma.js',()=>({prisma:{}}));
import {transferToAgencyOwner} from './agency-wallet-transfer.js';
function database(){
 const host={id:'h',publicId:'HOST-1',name:'Host',agencyId:'a',appRoles:['HOST'],status:'ACTIVE',country:'PK',hostSalaryCoinBalance:100n};
 const owner={id:'o',publicId:'OWNER-1',status:'ACTIVE',coinBalance:0n};
 const rules={hostTransferEnabled:true,hostExchangeEnabled:true,hostDiamondsPerCoin:'3'};
 for(const prefix of ['transfer','exchange'])Object.assign(rules,{[prefix+'MinDiamonds']:'1',[prefix+'MaxDiamonds']:'1000',[prefix+'Multiple']:'1',[prefix+'DailyLimit']:'2000',[prefix+'MonthlyLimit']:'10000'});
 const tx={currencyPolicy:{findUnique:vi.fn(async()=>({version:1,rules}))},agency:{findUnique:vi.fn(async()=>({status:'ACTIVE',owner}))},user:{findUniqueOrThrow:vi.fn(async({where})=>where.id==='h'?host:owner),updateMany:vi.fn(async()=>({count:1}))},walletTransaction:{findUnique:vi.fn(async()=>null),aggregate:vi.fn(async()=>({_sum:{diamonds:0n}})),createMany:vi.fn(async()=>({}))},notification:{upsert:vi.fn(async()=>({}))}};
 return {host,owner,tx,$transaction:vi.fn(fn=>fn(tx))};
}
const input={diamonds:'10',recipientPublicId:'OWNER-1',policyVersion:1};
it('debits only converted Diamonds, credits owner Coins, and replays without double payment',async()=>{
 const db=database();const result=await transferToAgencyOwner('h',input,'request-1',db);
 expect(result).toMatchObject({exchangedDiamonds:'9',receivedCoins:'3',remainingDiamonds:'91'});
 expect(db.tx.user.updateMany.mock.calls[0][0].data).toEqual({hostSalaryCoinBalance:{decrement:9n}});
 expect(db.tx.user.updateMany.mock.calls[1][0]).toMatchObject({where:{id:'o'},data:{coinBalance:{increment:3n}}});
 const rows=db.tx.walletTransaction.createMany.mock.calls[0][0].data;
 expect(rows[0]).toMatchObject({userId:'h',diamonds:9n,direction:'DEBIT'});expect(rows[1]).toMatchObject({userId:'o',coins:3n,direction:'CREDIT'});
 db.tx.walletTransaction.findUnique.mockResolvedValue(rows[0]);
 expect(await transferToAgencyOwner('h',input,'request-1',db)).toEqual(result);
 expect(db.tx.user.updateMany).toHaveBeenCalledTimes(2);
 await expect(transferToAgencyOwner('h',{...input,diamonds:'11'},'request-1',db)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
});
it.each(['nonhost','inactive agency','frozen owner','frozen host','missing agency','self'])('rejects %s before debit',async kind=>{
 const db=database();if(kind==='nonhost')db.host.appRoles=[];if(kind==='inactive agency')db.tx.agency.findUnique.mockResolvedValue({status:'INACTIVE',owner:db.owner});if(kind==='frozen owner')db.owner.walletFrozen=true;if(kind==='frozen host')db.host.walletFrozen=true;if(kind==='missing agency')db.host.agencyId=null;if(kind==='self')db.owner.id='h';
 await expect(transferToAgencyOwner('h',input,'request-1',db)).rejects.toMatchObject({code:'TRANSFER_DISABLED'});expect(db.tx.user.updateMany).not.toHaveBeenCalled();
});
it.each([{recipientPublicId:'OTHER'}, {policyVersion:2}])('rejects stale recipient or rate %j',async change=>{const db=database();await expect(transferToAgencyOwner('h',{...input,...change},'request-1',db)).rejects.toMatchObject({code:'QUOTE_CHANGED'});expect(db.tx.user.updateMany).not.toHaveBeenCalled();});
it('rejects insufficient balance and exhausted daily limits',async()=>{const db=database();db.tx.user.updateMany.mockResolvedValue({count:0});await expect(transferToAgencyOwner('h',input,'request-1',db)).rejects.toMatchObject({code:'INSUFFICIENT_DIAMONDS'});expect(db.tx.walletTransaction.createMany).not.toHaveBeenCalled();db.tx.walletTransaction.aggregate.mockResolvedValue({_sum:{diamonds:2000n}});await expect(transferToAgencyOwner('h',input,'request-2',db)).rejects.toMatchObject({code:'TRANSFER_DAILY_LIMIT'});});
