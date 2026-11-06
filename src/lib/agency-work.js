import { cycleHostTotals, scheduleFor, salaryProgress, agencyShares, salaryRate } from './host-salary.js';
import { moduleCycle } from './reporting-cycles.js';
import { managementRole } from "./user-roles.js";
import { hostReportAliases } from "./host-report-identity.js";
export const DIAMONDS_PER_USD = 90000n;
export function usdValue(diamonds, rate = DIAMONDS_PER_USD) {
  const cents = BigInt(diamonds) * 100n / BigInt(rate);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function validateSalaryTiers(input) {
  if (!Array.isArray(input) || !input.length || input.length > 30) throw new Error("Enter between 1 and 30 targets.");
  const tiers = input.map(t => {
    if (!t || !/^\d+$/.test(String(t.minDiamonds)) || BigInt(t.minDiamonds) <= 0n || BigInt(t.minDiamonds) > 9223372036854775807n) throw new Error("Targets must be positive whole Diamonds.");
    if (!Number.isInteger(t.commissionBps) || t.commissionBps < 0 || t.commissionBps > 10000) throw new Error("Commission must be between 0% and 100%, with at most two decimal places.");
    return { minDiamonds: BigInt(t.minDiamonds).toString(), commissionBps: t.commissionBps };
  }).sort((a,b) => BigInt(a.minDiamonds) < BigInt(b.minDiamonds) ? -1 : 1);
  if (new Set(tiers.map(t => t.minDiamonds)).size !== tiers.length) throw new Error("Targets must be unique.");
  return tiers;
}
export function talentCommission(diamonds, tiers) {
  const achieved = [...tiers].reverse().find(t => BigInt(diamonds) >= BigInt(t.minDiamonds));
  return { targetDiamonds: achieved?.minDiamonds ?? null, commissionBps: achieved?.commissionBps ?? 0,
    salaryDiamonds: (BigInt(diamonds) * BigInt(achieved?.commissionBps ?? 0) / 10000n).toString() };
}
export function agencyWork(settlements, policy, aliases = new Map()) {
  const hosts = new Map();
  let unvaluedGiftCount = 0;
  for (const s of settlements) {
    const gift = s.giftTransaction;
    const userId = gift.recipientUserId ?? aliases.get(gift.talentId)?.id;
    const key = userId ? `USER:${userId}` : gift.talentId ? `TALENT:${gift.talentId}` : null;
    if (!key) continue;
    const row = hosts.get(key) ?? { key, diamonds: 0n, unvaluedGiftCount: 0 };
    if (s.recipientDiamonds === null || s.recipientDiamonds === undefined) { row.unvaluedGiftCount++; unvaluedGiftCount++; }
    else row.diamonds += BigInt(s.recipientDiamonds);
    hosts.set(key, row);
  }
  const rows = [...hosts.values()].map(h => ({ ...h, diamonds: h.diamonds.toString(), ...talentCommission(h.diamonds, policy?.tiers ?? []) }));
  const totalDiamonds = rows.reduce((n,r) => n + BigInt(r.diamonds), 0n);
  const salaryDiamonds = rows.reduce((n,r) => n + BigInt(r.salaryDiamonds), 0n);
  const rate = policy?.diamondsPerUsd;
  const valued = rate != null && BigInt(rate) > 0n;
  return { totalDiamonds: String(totalDiamonds), salaryDiamonds: String(salaryDiamonds), totalUsd: valued ? usdValue(totalDiamonds,rate) : null, salaryUsd: valued ? usdValue(salaryDiamonds,rate) : null,
    diamondsPerUsd: valued ? String(rate) : null, qualifiedTalents: rows.filter(r => r.targetDiamonds !== null).length, unvaluedGiftCount,
    policyConfigured: Boolean(policy), policyVersion: policy?.version ?? null, tiers: policy?.tiers ?? [], hosts: rows };
}
export async function agencyWorkReports(db, agencies, period, aliases = new Map()) {
  const schedule=await scheduleFor(db,period.start);
  if(schedule && !period.commissionUnavailable) {
    const reports=new Map(agencies.map(a=>[a.id,new Map()]));
    let tiers=schedule.tiers;
    for(let at=period.start;at<period.end;) {
      const cycle=await moduleCycle(db,'HOST_SALARY',at);
      if(+cycle.start!==+at || cycle.end>period.end)return agencyWorkReports(db,agencies,{...period,commissionUnavailable:true},aliases);
      tiers=(await scheduleFor(db,cycle.start)).tiers;
      const totals=await cycleHostTotals(db,cycle);
      const closed=await db.hostSalaryAward.findMany({where:{cycleStart:cycle.start}});
      const receipts=new Map(closed.map(r=>[r.userId,r]));
      for(const [id,host] of totals) {
        const award=receipts.get(id);
        const tier=award?tiers.find(t=>t.level===award.level):salaryProgress(host.total,tiers).current;
        const shares=award?.agencyShares ?? agencyShares(host.agencies,tier);
        for(const [agencyId,diamonds] of host.agencies) {
          const report=reports.get(agencyId);
          if(!report)continue;
          const row=report.get(id) ?? {key:'USER:'+id,diamonds:0n,salaryDiamonds:0n,unvaluedGiftCount:0};
          row.diamonds+=diamonds;
          row.salaryDiamonds+=BigInt(shares[agencyId] ?? 0);
          row.unvaluedGiftCount+=Number(host.incomplete);
          row.targetDiamonds=tier?String(tier.target):null;
          row.commissionBps=tier?tier.percent*100:0;
          report.set(id,row);
        }
      }
      at=cycle.end;
    }
    return agencies.map(agency=>{
      const rows=[...reports.get(agency.id).values()];
      const total=rows.reduce((s,r)=>s+r.diamonds,0n),salary=rows.reduce((s,r)=>s+r.salaryDiamonds,0n);
      return {...agency,work:{totalDiamonds:String(total),salaryDiamonds:String(salary),totalUsd:usdValue(total),salaryUsd:usdValue(salary),
        diamondsPerUsd:String(salaryRate),qualifiedTalents:rows.filter(r=>r.targetDiamonds).length,unvaluedGiftCount:rows.reduce((s,r)=>s+r.unvaluedGiftCount,0),
        policyConfigured:true,policyVersion:Number(schedule.effectiveFrom.toISOString().slice(0,10).replaceAll("-","")),tiers:tiers.map(t=>({minDiamonds:String(t.target),commissionBps:t.percent*100})),
        hosts:rows.map(r=>({...r,diamonds:String(r.diamonds),salaryDiamonds:String(r.salaryDiamonds)}))}};
    });
  }
  const [policy, settlements] = await Promise.all([
    period.commissionUnavailable ? null : db.agencySalaryPolicy.findUnique({ where: { month: period.policyKey ?? period.month } }),
    db.giftSettlement.findMany({ where: { agencyId: { in: agencies.map(a => a.id) }, giftTransaction: { reversedAt: null }, createdAt: { gte: period.start, lt: period.end } },
      select: { agencyId: true, recipientDiamonds: true, giftTransaction: { select: { recipientUserId: true, talentId: true, talent: { select: { id: true, publicId: true } } } } } }),
  ]);
  const talents = settlements.map(s => s.giftTransaction.talent).filter(Boolean);
  if (talents.length) {
    const users = await db.user.findMany({ where: { publicId: { in: [...new Set(talents.map(t => t.publicId))] } }, select: { id: true, publicId: true } });
    aliases = new Map([...aliases, ...hostReportAliases(users, talents)]);
  }
  const grouped = new Map();
  for (const row of settlements) { if (!grouped.has(row.agencyId)) grouped.set(row.agencyId, []); grouped.get(row.agencyId).push(row); }
  return agencies.map(a => ({ ...a, work: agencyWork(grouped.get(a.id) ?? [], policy, aliases) }));
}
// Each agency is counted once at every ancestor, including supervisors with no direct agencies.
export function hierarchyWork(people, agencies) {
  const rates = new Set(agencies.map(a => a.work.diamondsPerUsd));
  const rate = rates.size === 1 ? [...rates][0] : null;
  const rows = new Map(people.map(p => [p.id, { ...p, totalDiamonds: 0n, salaryDiamonds: 0n, agencyCount: 0 }]));
  for (const agency of agencies) {
    let id = agency.bdUserId;
    const seen = new Set();
    while (id && rows.has(id) && !seen.has(id)) {
      seen.add(id);
      const row = rows.get(id);
      row.totalDiamonds += BigInt(agency.work.totalDiamonds);
      row.salaryDiamonds += BigInt(agency.work.salaryDiamonds);
      row.agencyCount++;
      id = row.supervisorUserId;
    }
  }
  return [...rows.values()].map(r => ({ publicId: r.publicId, name: r.name, role: r.teamRole ?? managementRole(r),
    supervisorId: rows.get(r.supervisorUserId)?.publicId ?? null, agencyCount: r.agencyCount,
    totalDiamonds: String(r.totalDiamonds), salaryDiamonds: String(r.salaryDiamonds), totalUsd: rate ? usdValue(r.totalDiamonds,rate) : null, salaryUsd: rate ? usdValue(r.salaryDiamonds,rate) : null }));
}
