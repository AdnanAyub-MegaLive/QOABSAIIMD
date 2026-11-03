import { expect, it, vi } from 'vitest';
import { calendarCycle, cycleFromPolicies, reportCycle, saveCycle } from './reporting-cycles.js';
const at=s=>new Date(s+'T00:00:00Z');
it('handles exact half-month UTC boundaries and leap years',()=>{
 expect(calendarCycle(at('2028-02-15'),15)).toMatchObject({start:at('2028-02-01'),end:at('2028-02-16'),key:'2028-02-H1'});
 expect(calendarCycle(at('2028-02-16'),15)).toMatchObject({start:at('2028-02-16'),end:at('2028-03-01'),key:'2028-02-H2'});
 expect(calendarCycle(at('2026-12-31'),30)).toMatchObject({start:at('2026-12-01'),end:at('2027-01-01')});
});
it('does not rewrite historical cycles when a future policy exists',()=>{
 const rows=[{days:15,effectiveFrom:at('2026-12-01'),revision:1}];
 expect(cycleFromPolicies(rows,at('2026-11-20')).days).toBe(30);
 expect(cycleFromPolicies(rows,at('2026-12-20')).key).toBe('2026-12-H2');
});
it('schedules monthly on the next first, without overlapping the first half',async()=>{
 const rows=[{days:15,effectiveFrom:at('2026-11-01'),revision:1}];
 const tx={reportingCyclePolicy:{findMany:async()=>rows,create:vi.fn(async({data})=>({id:'new',...data}))},auditLog:{create:vi.fn()}};
 const db={$transaction:fn=>fn(tx)},admin={id:'admin',active:true,role:'SUPER_ADMIN'};
 const saved=await saveCycle(db,admin,{module:'HOST_SALARY',days:30,revision:1},at('2026-11-05'));
 expect(saved.effectiveFrom).toEqual(at('2026-12-01'));
 expect(tx.auditLog.create).toHaveBeenCalledOnce();
 await expect(saveCycle(db,admin,{module:'HOST_SALARY',days:30,revision:0},at('2026-11-05'))).rejects.toMatchObject({status:409});
 rows.push({...saved});
 await expect(saveCycle(db,admin,{module:'HOST_SALARY',days:30,revision:2},at('2026-11-06'))).rejects.toMatchObject({status:409});
});
it('only Platform Admin may schedule a cycle',async()=>{
 await expect(saveCycle({}, {active:true,role:'STAFF'}, {module:'HOST_SALARY',days:15,revision:0})).rejects.toMatchObject({status:403});
});
it('resolves explicit historical halves and rejects halves on monthly configuration',async()=>{
 const db={reportingCyclePolicy:{findMany:async()=>[{days:15,effectiveFrom:at('2026-11-01'),revision:1}]}};
 expect((await reportCycle(db,'HOST_SALARY','2026-11-H2',at('2026-12-01'))).key).toBe('2026-11-H2');
 db.reportingCyclePolicy.findMany=async()=>[];
 await expect(reportCycle(db,'HOST_SALARY','2026-11-H1',at('2026-12-01'))).rejects.toMatchObject({status:422});
});

it('keeps module settings isolated and day/week rankings unchanged',async()=>{
 const {configuredRankingWindow}=await import('./events/ranking-contract.js');
 const db={reportingCyclePolicy:{findMany:vi.fn(async({where})=>where.module==='CHARM_RANKING'?[{days:15,effectiveFrom:at('2026-11-01'),revision:1}]:[])}};
 expect((await configuredRankingWindow(db,'charm','month',at('2026-11-20'))).key).toBe('2026-11-H2');
 expect((await configuredRankingWindow(db,'wealth','month',at('2026-11-20'))).key).toBe('2026-11');
 expect((await configuredRankingWindow(db,'charm','today',at('2026-11-20'))).end).toEqual(at('2026-11-21'));
 expect(db.reportingCyclePolicy.findMany).toHaveBeenCalledTimes(2);
});
