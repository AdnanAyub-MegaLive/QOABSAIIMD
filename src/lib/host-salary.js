import { isHostUser } from "./user-roles.js";
import { createHash } from 'node:crypto';
import { moduleCycle } from './reporting-cycles.js';

export const salaryRate = 90000n;
export function salaryUsd(diamonds) {
  const cents = BigInt(diamonds) * 100n / salaryRate;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export function scheduleRevision(schedule, notice) {
  return createHash('sha256').update(JSON.stringify([schedule.effectiveFrom,schedule.tiers,notice])).digest('hex');
}
export function scheduleFor(db, start) {
  return db.hostSalarySchedule.findFirst({where:{effectiveFrom:{lte:start}},orderBy:{effectiveFrom:'desc'}});
}
export function salaryProgress(earned, tiers) {
  const current = tiers.filter(t => earned >= BigInt(t.target)).at(-1);
  const next = tiers.find(t => earned < BigInt(t.target));
  return { level:current?.level ?? 0, current:current ?? null, next:next ?? null,
    remaining:String(next ? BigInt(next.target)-earned : 0n), earned:String(earned), earnedUsd:salaryUsd(earned) };
}
export async function hostGiftRows(db, period, user) {
  const recipient = user ? { OR:[{recipientUserId:user.id},{recipientUserId:null,talent:{publicId:user.publicId}}] } : {};
  return db.giftSettlement.findMany({where:{recipientType:'HOST',createdAt:{gte:period.start,lt:period.end},
    giftTransaction:{reversedAt:null,...recipient}},select:{agencyId:true,recipientDiamonds:true,
      giftTransaction:{select:{recipientUserId:true,talent:{select:{publicId:true}}}}}});
}
export async function hostWithdrawalPolicy(db,user,policy) {
  if (!isHostUser(user)) return policy;
  const cycle=await moduleCycle(db,'HOST_SALARY'), schedule=await scheduleFor(db,cycle.start);
  const rows=await hostGiftRows(db,cycle,user);
  const earned=rows.reduce((sum,row)=>sum+(row.recipientDiamonds ?? 0n),0n);
  if(!schedule || earned<BigInt(schedule.tiers[0].target)) {
    throw Object.assign(new Error('Reach Host Salary Level 1 this cycle before withdrawing or transferring diamonds.'),{code:'HOST_SALARY_LEVEL_REQUIRED',status:403});
  }
  const rules={...policy.rules,withdrawalDiamondsPerUsd:String(salaryRate)};
  // Preserve disabled or incomplete payout configurations and account-wide limits.
  // A qualified host may redeem their entire available amount between tier targets.
  const balance=BigInt(user.hostSalaryCoinBalance ?? 0);
  for(const prefix of ['withdrawal','transfer']) {
    const min=prefix+'MinDiamonds', max=prefix+'MaxDiamonds';
    if(BigInt(rules[min] || 0)>0n && BigInt(rules[max] || 0)>0n) {
      rules[min]='1';
      if(balance>BigInt(rules[max]))rules[max]=String(balance);
      if(prefix==='transfer' && BigInt(rules.transferMultiple || 0)>0n)rules.transferMultiple='1';
    }
  }
  return {...policy,rules};
}

// Split the single host-level commission among agencies by the diamonds
// attributed to each at settlement. Largest remainders preserve the exact total.
export function agencyShares(earnedByAgency, tier) {
  const total = [...earnedByAgency.values()].reduce((a,b)=>a+b,0n);
  if (!total || !tier) return {};
  const commission = BigInt(tier.target) * BigInt(tier.percent) / 100n;
  const rows = [...earnedByAgency].map(([id,value])=>({id,amount:commission*value/total,remainder:commission*value%total}));
  rows.sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1);
  const extra = Number(commission-rows.reduce((s,r)=>s+r.amount,0n));
  return Object.fromEntries(rows.map((r,i)=>[r.id,String(r.amount+(i<extra?1n:0n))]));
}

export async function cycleHostTotals(db,period) {
  const rows=await hostGiftRows(db,period);
  const legacyIds=[...new Set(rows.filter(r=>!r.giftTransaction.recipientUserId).map(r=>r.giftTransaction.talent?.publicId).filter(Boolean))];
  const users=legacyIds.length?await db.user.findMany({where:{publicId:{in:legacyIds}},select:{id:true,publicId:true}}):[];
  const aliases=new Map(users.map(u=>[u.publicId,u.id]));
  const hosts=new Map();
  for(const row of rows) {
    const id=row.giftTransaction.recipientUserId ?? aliases.get(row.giftTransaction.talent?.publicId);
    if(!id)continue;
    const host=hosts.get(id) ?? {total:0n,agencies:new Map(),incomplete:false};
    if(row.recipientDiamonds==null)host.incomplete=true;
    const amount=row.recipientDiamonds ?? 0n;
    host.total+=amount;
    const agency=row.agencyId ?? 'unassigned';
    host.agencies.set(agency,(host.agencies.get(agency) ?? 0n)+amount);
    hosts.set(id,host);
  }
  return hosts;
}
