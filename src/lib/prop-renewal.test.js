import {it,expect,vi,afterEach} from 'vitest';
import {renewProp} from './prop-renewal.js';
afterEach(()=>vi.useRealTimers());
function fixture(){
 const tx={$queryRaw:vi.fn(),user:{findUnique:vi.fn(async()=>({status:'ACTIVE',coinBalance:1000n})),updateMany:vi.fn(async()=>({count:1}))},propPurchase:{findUnique:vi.fn(async()=>null),create:vi.fn()},uploadAsset:{findFirst:vi.fn(async()=>({id:'asset',publicId:'AST-1',name:'Frame',coinPrice:100n,defaultGrantDurationMinutes:10080}))},uploadAssetAssignment:{findUnique:vi.fn(async()=>({expiresAt:new Date('2026-11-01T00:00:00Z')})),update:vi.fn()},walletTransaction:{create:vi.fn()},auditLog:{create:vi.fn()}};
 const db={$transaction:vi.fn(fn=>fn(tx))};return {tx,db};
}
it('extends running ownership and writes one atomic purchase, ledger and audit',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-22T00:00:00Z'));
 const {tx,db}=fixture();const r=await renewProp(db,'u','AST-1','request-123');
 expect(r.expiresAt).toBe('2026-11-08T00:00:00.000Z');expect(r.coinBalance).toBe('900');expect(r.addedDays).toBe(7);
 expect(tx.propPurchase.create.mock.calls[0][0].data.kind).toBe('RENEWAL');expect(tx.walletTransaction.create).toHaveBeenCalledOnce();expect(tx.auditLog.create).toHaveBeenCalledOnce();
 expect(tx.uploadAssetAssignment.update.mock.calls[0][0].data).not.toHaveProperty('source');
 tx.propPurchase.findUnique.mockResolvedValue({assetPublicId:'AST-1',kind:'RENEWAL',result:r});
 expect(await renewProp(db,'u','AST-1','request-123')).toEqual(r);expect(tx.user.updateMany).toHaveBeenCalledOnce();
 await expect(renewProp(db,'u','AST-2','request-123')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
});
it('restarts expired ownership from now',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-12-01T00:00:00Z'));const {db}=fixture();
 expect((await renewProp(db,'u','AST-1','request-123')).expiresAt).toBe('2026-12-08T00:00:00.000Z');
});
it.each([['NOT_OWNED',null],['NOT_RENEWABLE',{expiresAt:null}]])('rejects %s before debit',async(code,owned)=>{
 const {db,tx}=fixture();tx.uploadAssetAssignment.findUnique.mockResolvedValue(owned);
 await expect(renewProp(db,'u','AST-1','request-123')).rejects.toMatchObject({code});expect(tx.user.updateMany).not.toHaveBeenCalled();
});
it('refuses insufficient funds without changing entitlement',async()=>{
 const {db,tx}=fixture();tx.user.updateMany.mockResolvedValue({count:0});await expect(renewProp(db,'u','AST-1','request-123')).rejects.toMatchObject({code:'INSUFFICIENT_COINS',status:402});expect(tx.uploadAssetAssignment.update).not.toHaveBeenCalled();
});
it('validates the request key and retries serializable conflicts',async()=>{
 const {db}=fixture();await expect(renewProp(db,'u','AST-1','bad')).rejects.toMatchObject({status:422});
 db.$transaction.mockRejectedValueOnce({code:'P2034'});await expect(renewProp(db,'u','AST-1','request-123')).resolves.toHaveProperty('purchaseId');expect(db.$transaction).toHaveBeenCalledTimes(2);
});
