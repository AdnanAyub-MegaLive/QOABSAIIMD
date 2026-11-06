import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertCpGiftEligible } from './cp-gift-eligibility.js';
const gift = { giftCategory: 'CP_GIFT' };
const db = rows => ({ profileRelationship: { findMany: vi.fn().mockResolvedValue(rows) } });
describe('CP gift eligibility', () => {
  it('allows users with different active partners, regardless of CP level', async () => {
    const tx=db([{leftUserId:'a',rightUserId:'partner-a'},{leftUserId:'b',rightUserId:'partner-b'}]);
    await expect(assertCpGiftEligible(tx,gift,'a',['b'])).resolves.toBeUndefined();
  });
  it('allows a gift between partners',async()=>{
    await expect(assertCpGiftEligible(db([{leftUserId:'a',rightUserId:'b'}]),gift,'a',['b'])).resolves.toBeUndefined();
  });
  it.each([{rows:[]},{rows:[{leftUserId:'a',rightUserId:'partner-a'}]},{rows:[{leftUserId:'b',rightUserId:'partner-b'}]}])('rejects missing sender or recipient membership',async ({rows})=>{
    await expect(assertCpGiftEligible(db(rows),gift,'a',['b'])).rejects.toMatchObject({code:'CP_GIFT_RELATIONSHIP_REQUIRED',status:403});
  });
  it('rejects the whole multi-recipient send when one user is ineligible',async()=>{
    await expect(assertCpGiftEligible(db([{leftUserId:'a',rightUserId:'b'}]),gift,'a',['b','c'])).rejects.toMatchObject({code:'CP_GIFT_RELATIONSHIP_REQUIRED'});
  });
  it('excludes pending, expired, one-sided, deleted and inactive partnerships in the database query',async()=>{
    const tx=db([]),now=new Date('2026-11-05T00:00:00Z');
    await assertCpGiftEligible(tx,gift,'a',['b'],now).catch(()=>{});
    expect(tx.profileRelationship.findMany).toHaveBeenCalledWith({where:{type:'CP',status:'ACTIVE',leftAcceptedAt:{not:null},rightAcceptedAt:{not:null},OR:[{expiresAt:null},{expiresAt:{gt:now}}],AND:[{OR:[{leftUserId:{in:['a','b']}},{rightUserId:{in:['a','b']}}]}],left:{status:'ACTIVE',deletedAt:null},right:{status:'ACTIVE',deletedAt:null}},orderBy:{id:'asc'},select:{id:true,maintenanceDueAt:true,leftUserId:true,rightUserId:true}});
  });
  it('does not restrict other gift categories or query relationships for them',async()=>{
    const tx=db([]);
    for(const giftCategory of ['NORMAL','LUCKY','VIP',null])await assertCpGiftEligible(tx,{giftCategory},'a',['b']);
    expect(tx.profileRelationship.findMany).not.toHaveBeenCalled();
  });
  it.each([
    ['src/app/api/gifts/send/route.js','tx.user.updateManyAndReturn'],
    ['src/app/api/v1/gifts/backpack/send/route.js','tx.userGiftInventory.updateMany'],
    ['src/lib/multi-gift-settlement.js','tx.userGiftInventory.updateMany'],
  ])('checks eligibility before charging in %s',(path,debit)=>{
    const source=readFileSync(path,'utf8');
    expect(source.indexOf('await assertCpGiftEligible(')).toBeGreaterThan(0);
    expect(source.indexOf('await assertCpGiftEligible(')).toBeLessThan(source.indexOf(debit));
  });
});
