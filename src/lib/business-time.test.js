import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { calendarWindow, calendarSelection, parsePortalDate, portalDateTimeInput, portalFormat } from './business-time.js';
import { calendarCycle, reportCycle, cycleFromPolicies } from './reporting-cycles.js';
import { checkInDay } from './task-center-config.js';
import { rankingWindow } from './events/ranking-contract.js';
import { roomRankingPeriod } from './room-ranking-contract.js';
import { utcGameDay } from './game-control/shared-schedule.js';
import { sharedClock } from './game-control/shared-engine.mjs';
import { weeklyStarInput } from './events/weekly-star.js';
import { periodStart } from './task-periods.js';
import { checkDiamondLimits } from './diamond-service-rules.js';
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT', '2026-11-14T00:00:00Z'));
afterEach(() => vi.unstubAllEnvs());
const iso = d => d.toISOString();
it.each([
  ['day','2026-11-14T00:00:00Z','2026-11-14T17:00:00Z'],
  ['week','2026-11-16T00:00:00Z','2026-11-22T17:00:00Z'],
  ['halfmonth','2026-11-16T00:00:00Z','2026-11-30T17:00:00Z'],
  ['month','2026-12-01T00:00:00Z','2026-12-31T17:00:00Z'],
])('finishes old %s and starts a shortened transition without overlap', (kind,start,end) => {
  const old = calendarWindow(kind,new Date(Date.parse(start)-1));
  const next = calendarWindow(kind,new Date(start));
  expect(old.end).toEqual(next.start);
  expect(iso(next.start)).toBe(iso(new Date(start)));
  expect(iso(next.end)).toBe(iso(new Date(end)));
  expect(calendarWindow(kind,next.end).start).toEqual(next.end);
  expect(old.timezone).toBe('UTC');
  expect(next.timezone).toBe('Asia/Bangkok');
});
it('uses local midnight, Monday, leap-year and year-rollover boundaries', () => {
  const at = new Date('2028-02-29T17:00:00Z');
  expect(calendarWindow('day',at).key).toBe('2028-03-01');
  expect(iso(calendarWindow('month',at).end)).toBe('2028-03-31T17:00:00.000Z');
  expect(calendarSelection('month','2028-02-01').end).toEqual(at);
  expect(calendarWindow('week',new Date('2026-12-06T17:00:00Z')).key).toBe('2026-12-07');
  expect(calendarWindow('month',new Date('2026-12-31T17:00:00Z')).key).toBe('2027-01');
});
it('keeps check-in streaks across the shortened day and prevents a second same-day claim', () => {
  const last = new Date('2026-11-14T00:00:00Z'), now = new Date('2026-11-14T17:00:00Z');
  expect(checkInDay({currentStreak:7,lastSignInDate:last},now)).toMatchObject({count:8,day:1,claimedToday:false});
  expect(checkInDay({currentStreak:8,lastSignInDate:now},new Date(+now+60000)).claimedToday).toBe(true);
});
it('uses the same UTC+7 reset for tasks, room rankings, event rankings and games', () => {
  const now = new Date('2026-12-07T18:00:00Z');
  const expected = '2026-12-08T17:00:00.000Z';
  expect(iso(rankingWindow('today',now).end)).toBe(expected);
  expect(iso(periodStart({cadence:'DAILY'},now))).toBe('2026-12-07T17:00:00.000Z');
  expect(roomRankingPeriod('DAILY',now).end).toBe(expected);
  expect(iso(new Date(utcGameDay(+now).end))).toBe(expected);
  const day = { day: calendarWindow('day',now).start, durationMs:60000, settings:{scheduleRoundOffset:0} };
  expect(sharedClock(day,+now).endsAt).toBeLessThanOrEqual(Date.parse(expected));
});
it('enforces Diamond daily and monthly usage from their UTC+7 boundaries', async () => {
  const aggregate = vi.fn(async()=>({_sum:{diamonds:0n}}));
  await checkDiamondLimits({walletTransaction:{aggregate}},'u',1n,{dailyLimit:'10',monthlyLimit:'100'},'EXCHANGE',new Date('2027-01-01T18:00:00Z'));
  expect(aggregate.mock.calls.map(([a])=>iso(a.where.createdAt.gte))).toEqual(['2027-01-01T17:00:00.000Z','2026-12-31T17:00:00.000Z']);
});
it('parses admin wall-clock inputs independently of the machine timezone', () => {
  expect(iso(parsePortalDate('2026-12-01T00:15'))).toBe('2026-11-30T17:15:00.000Z');
  expect(portalDateTimeInput('2026-11-30T17:15:00Z')).toBe('2026-12-01T00:15');
  expect(iso(parsePortalDate('2026-12-01'))).toBe('2026-11-30T17:00:00.000Z');
  expect(portalFormat('2026-11-30T17:15:00Z','en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'})).toBe('00:15');
});
it('selects December at the local start of month, with local half-month boundaries', async () => {
  const now = new Date('2026-12-31T18:00:00Z');
  const db = {reportingCyclePolicy:{findMany:async()=>[]}};
  expect((await reportCycle(db,'HOST_SALARY','2026-12',new Date('2026-12-02'))).start).toEqual(new Date('2026-12-01T00:00:00Z'));
  expect((await reportCycle(db,'HOST_SALARY',null,now)).key).toBe('2027-01');
  expect(calendarCycle(new Date('2026-12-15T17:00:00Z'),15).key).toBe('2026-12-H2');
});
it('stores Weekly Star Monday at Sunday 17:00 UTC', () => {
  expect(iso(weeklyStarInput({week:'2026-12-07',giftIds:[]},new Date('2026-12-01')).startsAt)).toBe('2026-12-06T17:00:00.000Z');
});
it.each([[15,30],[30,15]])('keeps policy changes from %i to %i contiguous at cutover', (before,after) => {
  const policies = [{days:before,revision:1,effectiveFrom:new Date('2026-01-01')},{days:after,revision:2,effectiveFrom:new Date('2026-12-01')}];
  const closing = cycleFromPolicies(policies,new Date('2026-11-20'));
  const tail = cycleFromPolicies(policies,new Date('2026-11-30T22:00:00Z'));
  const opening = cycleFromPolicies(policies,new Date('2026-12-01'));
  expect(closing.end).toEqual(opening.start);
  expect(tail.start).toEqual(closing.start);
  expect(tail.key).toBe(closing.key);
});
