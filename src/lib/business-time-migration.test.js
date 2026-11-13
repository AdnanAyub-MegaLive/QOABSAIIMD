import { afterEach, expect, it, vi } from 'vitest';
import { alignBusinessSchedules } from './business-time-migration.js';
afterEach(() => vi.unstubAllEnvs());
it('realigns only future configurations once and preserves the first old boundary', async () => {
  vi.stubEnv('NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT','2026-11-14T00:00:00Z');
  const records = {
    weeklyStarWeek:[{startsAt:new Date('2026-11-09')},{startsAt:new Date('2026-11-16')},{startsAt:new Date('2026-11-23')}],
    prettyIdPolicy:[{id:1,effectiveFrom:new Date('2026-11-23')}],
    roomRewardPolicy:[{version:1,effectiveFrom:new Date('2026-11-14')},{version:2,effectiveFrom:new Date('2026-11-15')}],
    reportingCyclePolicy:[{id:'monthly',module:'HOST_SALARY',days:30,revision:1,effectiveFrom:new Date('2026-01-01')}],
    hostSalarySchedule:[{effectiveFrom:new Date('2026-12-01')},{effectiveFrom:new Date('2027-01-01')}],
    rankingRewardPolicy:[{id:'r',track:'wealth',period:'today',effectiveFrom:new Date('2026-11-15')}],
    roomRewardActivation:[{id:'GLOBAL',startsAt:new Date('2026-10-01')}],
    hostSalaryControl:[{id:'global',nextCloseStart:new Date('2026-11-01')}],
  };
  const db = {$queryRaw:vi.fn(), auditLog:{create:vi.fn()}};
  for (const [model,rows] of Object.entries(records)) db[model] = {
    findMany:async({where}) => rows.filter(row => Object.entries(where).every(([k,v]) => typeof v === 'object' ? ('gt' in v ? row[k] > v.gt : row[k] <= v.lte) : row[k] === v)),
    update:async({where,data}) => Object.assign(rows.find(row => Object.entries(where).every(([k,v])=>String(row[k])===String(v))),data),
  };
  db.$transaction = fn => fn(db);
  const now = new Date('2026-11-13T12:00:00Z');
  expect((await alignBusinessSchedules(db,now)).aligned).toBe(5);
  expect(records.weeklyStarWeek.map(r=>r.startsAt.toISOString())).toEqual(['2026-11-09T00:00:00.000Z','2026-11-16T00:00:00.000Z','2026-11-22T17:00:00.000Z']);
  expect(records.hostSalarySchedule.map(r=>r.effectiveFrom.toISOString())).toEqual(['2026-12-01T00:00:00.000Z','2026-12-31T17:00:00.000Z']);
  expect(records.hostSalaryControl[0].nextCloseStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  expect((await alignBusinessSchedules(db,now)).aligned).toBe(0);
  expect(db.auditLog.create).toHaveBeenCalledOnce();
});
