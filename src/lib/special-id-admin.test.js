import { describe, it, expect, vi } from 'vitest';
import { manageHistoricalSpecialId } from './special-id-admin.js';
function fixture(status = 'REVOKED', occupied = null) {
 const tx = { $queryRaw: vi.fn(), specialIdAssignment: { findUnique: vi.fn(async()=>({id:'old',userId:'old-user',definitionId:'def',specialId:'VIP123',status})), findFirst: vi.fn(async()=>occupied), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(async({data})=>({id:'new',...data})) }, specialIdDefinition: { update: vi.fn(), upsert: vi.fn(async()=>({id:'def',code:'VIP123'})) }, user: { findUnique: vi.fn(async()=>({id:'new-user',publicId:'USR-123',status:'ACTIVE'})) }, auditLog: { create: vi.fn() } };
 return { tx, db: { $transaction: fn=>fn(tx) } };
}
const input={assignmentId:'old',action:'REASSIGN',publicId:'USR-123',durationMinutes:10080,reason:'Admin requested'};
describe('historical Special ID administration',()=>{
 for(const status of ['REVOKED','EXPIRED','REPLACED']) it(`reassigns ${status} with a new timer and retains history`,async()=>{
  const {db,tx}=fixture(status);await manageHistoricalSpecialId(db,{id:'admin'},input);
  expect(tx.specialIdAssignment.create).toHaveBeenCalledOnce();
  const row=tx.specialIdAssignment.create.mock.calls[0][0].data;
  expect(row.userId).toBe('new-user');expect(+row.expiresAt- +row.startsAt).toBe(10080*60000);
  expect(tx.specialIdAssignment.update).not.toHaveBeenCalled();expect(tx.auditLog.create).toHaveBeenCalledOnce();
 });
 it('rejects reassignment when another user owns the code',async()=>{
  const {db,tx}=fixture('EXPIRED',{id:'occupied'});await expect(manageHistoricalSpecialId(db,{id:'admin'},input)).rejects.toThrow('currently owned');expect(tx.specialIdAssignment.create).not.toHaveBeenCalled();
 });
 it('removes history without affecting a current owner',async()=>{
  const {db,tx}=fixture('EXPIRED',{id:'occupied'});await manageHistoricalSpecialId(db,{id:'admin'},{...input,action:'DELETE'});
  expect(tx.specialIdAssignment.update).toHaveBeenCalledWith({where:{id:'old'},data:{status:'REMOVED'}});expect(tx.specialIdDefinition.update).not.toHaveBeenCalled();
 });
 it('archives an unused definition on removal',async()=>{
  const {db,tx}=fixture();await manageHistoricalSpecialId(db,{id:'admin'},{...input,action:'DELETE'});expect(tx.specialIdDefinition.update).toHaveBeenCalledWith({where:{id:'def'},data:{active:false,storeVisible:false}});
 });
 for(const status of ['ACTIVE','OWNED','CLAIMED','REMOVED']) it(`rejects operations on ${status}`,async()=>{
  const {db,tx}=fixture(status);await expect(manageHistoricalSpecialId(db,{id:'admin'},input)).rejects.toThrow('Only expired');expect(tx.specialIdAssignment.create).not.toHaveBeenCalled();
 });
 it('requires a reason and valid duration',async()=>{
  const {db}=fixture();await expect(manageHistoricalSpecialId(db,{id:'admin'},{...input,reason:''})).rejects.toThrow('reason');await expect(manageHistoricalSpecialId(db,{id:'admin'},{...input,durationMinutes:-1})).rejects.toThrow('duration');
 });
});
