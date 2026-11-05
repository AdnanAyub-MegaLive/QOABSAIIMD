import { describe, it, expect, vi } from 'vitest';
import { cpProgress, cpLevelInput, awardCpGift, syncCpLevel } from './cp-levels.js';

const levels = [1,2,3].map(level => ({ level, name: 'CP ' + level, minExp: BigInt(level * 100), enabled: true, seatEffect: 'WAVE_' + level, rewards: [{ kind: 'COINS', amount: '10', name: 'Coins' }] }));
function fixture() {
  const row = { id: 'rel', publicId: 'REL-1', type: 'CP', status: 'ACTIVE', exp: 0n, leftUserId: 'a', rightUserId: 'b' };
  const gifts = new Set(), claims = new Set();
  const tx = {
    $queryRaw: vi.fn(async()=>[]),
    profileRelationship: {
      findUnique: vi.fn(async()=>row), findFirst: vi.fn(async()=>row.status === 'ACTIVE' ? row : null),
      update: vi.fn(async({data})=>{ if(data.exp) row.exp += data.exp.increment; if(data.level != null) row.level=data.level; return {...row}; }),
    },
    cpGiftExperience: { createMany: vi.fn(async({data:[gift]})=>{if(gifts.has(gift.giftId))return {count:0};gifts.add(gift.giftId);return {count:1};}) },
    cpLevelClaim: { createMany: vi.fn(async({data:[claim]})=>{if(claims.has(claim.level))return {count:0};claims.add(claim.level);return {count:1};}) },
    cpLevel: { findMany: vi.fn(async()=>levels) },
    user: { updateMany: vi.fn(async()=>({count:1})) }, walletTransaction: { create: vi.fn() }, notification: { upsert: vi.fn() },
  };
  const gift = { id:'gift-1', senderId:'a', coinValue:250n, createdAt:new Date() };
  return { row, tx, gift, claims };
}
describe('CP progression',()=>{
  it('uses exact bigint thresholds, enabled levels and null at maximum',()=>{
    expect(cpProgress(99n,levels)).toMatchObject({level:0,nextLevelExp:'100'});
    expect(cpProgress(100n,levels)).toMatchObject({level:1,levelName:'CP 1',currentLevelExp:'100',nextLevelExp:'200'});
    expect(cpProgress(9007199254740993n,levels)).toMatchObject({level:3,exp:'9007199254740993',nextLevelExp:null});
    expect(cpProgress(250n,[levels[0],{...levels[1],enabled:false},levels[2]])).toMatchObject({level:1,nextLevelExp:'300'});
  });
  it('awards every crossed level to both partners exactly once on retry',async()=>{
    const {tx,row,gift}=fixture();
    await awardCpGift(tx,gift,{id:'b'},'PAID');
    await awardCpGift(tx,gift,{id:'b'},'PAID');
    expect(row).toMatchObject({exp:250n,level:2});
    expect(tx.user.updateMany).toHaveBeenCalledTimes(4);
    expect(tx.notification.upsert).toHaveBeenCalledTimes(4);
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(4);
  });
  it.each(['LUCKY','BACKPACK'])('excludes %s gifts before reading the relationship',async source=>{
    const {tx,gift}=fixture();await awardCpGift(tx,gift,{id:'b'},source);
    expect(tx.profileRelationship.findUnique).not.toHaveBeenCalled();
  });
  it('does not accrue for inactive, self or reversed gifts',async()=>{
    const {tx,row,gift}=fixture();row.status='REMOVED';
    await awardCpGift(tx,gift,{id:'b'},'PAID');await awardCpGift(tx,gift,{id:'a'},'PAID');
    await awardCpGift(tx,{...gift,reversedAt:new Date()},{id:'b'},'PAID');
    expect(tx.cpGiftExperience.createMany).not.toHaveBeenCalled();
  });
  it('recomputes changed levels and awards newly eligible levels without paying claimed levels again',async()=>{
    const {tx,row,gift}=fixture();await awardCpGift(tx,gift,{id:'b'},'PAID');
    await syncCpLevel(tx,row,levels.map(l=>({...l,minExp:BigInt(l.level*50)})));
    expect(row.level).toBe(3);expect(tx.user.updateMany).toHaveBeenCalledTimes(6);
    await syncCpLevel(tx,row,levels.map(l=>({...l,enabled:false})));
    expect(row.level).toBe(0);expect(tx.user.updateMany).toHaveBeenCalledTimes(6);
  });
  it('validates reward amounts and media settings',()=>{
    const input={...levels[0],minExp:'9007199254740993',fullAnimationUrl:'https://cdn.example/a.svga',fullAnimationMimeType:'application/svga'};
    expect(cpLevelInput(input).minExp).toBe(9007199254740993n);
    expect(()=>cpLevelInput({...input,seatEffect:'BOGUS'})).toThrow();
    expect(()=>cpLevelInput({...input,fullAnimationUrl:'javascript:alert(1)'})).toThrow();
    expect(()=>cpLevelInput({...input,rewards:[{kind:'COINS',name:'Coins',amount:'-1'}]})).toThrow();
  });
});
