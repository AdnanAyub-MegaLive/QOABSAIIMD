import { describe,it,expect,vi } from 'vitest';
import { Prisma } from '@prisma/client';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../props-store.js',()=>({equippablePropCategories:new Set(['FRAMES'])}));
vi.mock('../vip-commerce.js',()=>({selectOwnedVip:vi.fn(),vipRenewalExpiry:(old,days,now)=>new Date(now.getTime()+days*86400000)}));
vi.mock('./ranking-data.js',()=>({eventRankings:vi.fn().mockResolvedValue([])}));
import { rewardInput,policyFor } from './ranking-reward-rules.js';
import { awardRankingRound,maintainRankingRewards } from './ranking-rewards.js';

const input={track:'cp',period:'today',enabled:true,rewards:[{rank:1,coins:'100',diamonds:'50',props:[],vip:null}]};
describe('future-only ranking policies',()=>{
  it.each([['today','2026-10-17T00:00:00.000Z'],['week','2026-10-19T00:00:00.000Z'],['month','2026-11-01T00:00:00.000Z']])('starts %s at the next complete period', (period,expected)=>{
    expect(rewardInput({...input,period},new Date('2026-10-16T12:00:00Z')).effectiveFrom.toISOString()).toBe(expected);
  });
  it('never supplies a policy for a past period',()=>{
    const policy={...rewardInput(input,new Date('2026-10-16')),createdAt:new Date(),id:'p'};
    expect(policyFor([policy],new Date('2026-10-16'))).toBeNull();
    expect(policyFor([policy],new Date('2026-10-17'))).toBe(policy);
  });
  it('rejects duplicate ranks, fractional amounts and missing reward configuration',()=>{
    expect(()=>rewardInput({...input,rewards:[...input.rewards,...input.rewards]})).toThrow();
    expect(()=>rewardInput({...input,rewards:[{...input.rewards[0],coins:'1.5'}]})).toThrow();
    expect(()=>rewardInput({...input,rewards:[]})).toThrow();
    expect(rewardInput({...input,enabled:false,rewards:[]}).enabled).toBe(false);
  });
});

function fixture(recipients=['a','b']) {
  const round={id:'r',eventSlug:'ranking-cp',period:'today',policyId:'p',startsAt:new Date('2026-01-02'),endsAt:new Date('2026-01-03'),status:'PENDING',winners:[{rank:1,recipients}]};
  const policy={...input,id:'p',eventSlug:round.eventSlug,effectiveFrom:new Date('2026-01-02')};
  const tx={
    $queryRaw:vi.fn(),rankingRewardRound:{findUnique:vi.fn(async()=>round),update:vi.fn(async({data})=>Object.assign(round,data))},
    rankingRewardPolicy:{findUnique:vi.fn(async()=>policy)},event:{findUnique:vi.fn(async()=>({id:'e',status:'PUBLISHED'}))},
    user:{findUnique:vi.fn(async()=>({status:'ACTIVE',deletedAt:null})),update:vi.fn()},ban:{findFirst:vi.fn(async()=>null)},
    walletTransaction:{create:vi.fn()},notification:{upsert:vi.fn()},eventAuditLog:{create:vi.fn()}
  };
  return {round,tx,db:{$transaction:vi.fn(async f=>f(tx))}};
}
describe('ranking award transaction',()=>{
  it('awards both CP partners in full and replays a completed round without paying again',async()=>{
    const {tx,db,round}=fixture();
    await awardRankingRound('r',db);
    expect(tx.user.update).toHaveBeenCalledTimes(2);
    for(const [call] of tx.user.update.mock.calls){expect(call.data).toEqual({coinBalance:{increment:100n},hostSalaryCoinBalance:{increment:50n}});for(const key of Object.keys(call.data))expect(Prisma.UserScalarFieldEnum[key]).toBe(key);}
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.upsert).toHaveBeenCalledTimes(2);
    expect(round.status).toBe('AWARDED');
    await awardRankingRound('r',db);
    expect(tx.user.update).toHaveBeenCalledTimes(2);
    expect(db.$transaction.mock.calls[0][1].isolationLevel).toBe('Serializable');
  });
  it('does not pay anyone when a partner is banned',async()=>{
    const {tx,db}=fixture();tx.ban.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({id:'ban'});
    await expect(awardRankingRound('r',db)).rejects.toThrow('unavailable');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('pays only the agency owner resolved in the frozen result',async()=>{
    const {tx,db}=fixture(['owner']);await awardRankingRound('r',db);
    expect(tx.user.update.mock.calls[0][0].where.id).toBe('owner');expect(tx.user.update).toHaveBeenCalledTimes(1);
  });
  it('does not accept an unpublished event or a pre-activation round',async()=>{
    const {tx,db,round}=fixture();tx.event.findUnique.mockResolvedValueOnce({status:'DRAFT'});
    await expect(awardRankingRound('r',db)).rejects.toThrow('published');
    round.startsAt=new Date('2026-01-01');await expect(awardRankingRound('r',db)).rejects.toThrow('eligible');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('does nothing when no reward policies exist',async()=>{
    const db={rankingRewardPolicy:{findMany:async()=>[]},rankingRewardRound:{findMany:async()=>[]}};
    await expect(maintainRankingRewards(db)).resolves.toBeUndefined();
  });
});
