import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { assertDeletionInventory, deletedUserData, redactDeletedIdentity } from './account-deletion-policy.js';
describe('account deletion isolation', () => {
 it('reviews every User foreign-key model in the deployed schema', () => expect(() => assertDeletionInventory(Prisma.dmmf.datamodel.models)).not.toThrow());
 it('fails closed on new unreviewed user dependencies', () => expect(() => assertDeletionInventory([{name:'NewPrivateData',fields:[{kind:'object',type:'User',relationFromFields:['userId']}]}])).toThrow('UNREVIEWED_USER_RELATION'));
 it('does not mistake a monetary amount for a numeric public ID', () => {
  const value={coins:100, winners:[{publicId:'100',name:'Alice',profileImage:'secret',coins:100},{publicId:'200',name:'Bob',coins:200}]};
  expect(redactDeletedIdentity(value,new Set(['100']),'DELETED-X')).toEqual({coins:100,winners:[{publicId:'DELETED-X',name:null,profileImage:null,coins:100},{publicId:'200',name:'Bob',coins:200}]});
 });
 it('revokes OAuth, device identity, credentials and personal wallet data', () => {
  const data=deletedUserData('DELETED-X');
  for(const field of ['email','phone','googleEmail','googleSubject','signupDeviceId','passwordHash','dob','bio','profileImage','country']) expect(data[field]).toBeNull();
  expect(data.status).toBe('BANNED'); expect(data.coinBalance).toBe(0n);
 });
});
it('scrubs nested profiles and ID lists while preserving other users',()=>{
 expect(redactDeletedIdentity({userId:'u',profile:{displayName:'Secret'},paidUserIds:['u','v'],recipient:{userId:'v',name:'Keep'},coins:100},new Set(['u']),'gone')).toEqual({userId:'gone',profile:{displayName:null},paidUserIds:['gone','v'],recipient:{userId:'v',name:'Keep'},coins:100});
});
