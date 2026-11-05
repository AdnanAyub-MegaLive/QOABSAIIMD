import { describe, it, expect } from 'vitest';
import { rankingInput, rankingWindow, configuredRankingWindow } from './ranking-contract.js';
describe('event ranking contract', () => {
  it('uses UTC calendar days and Monday weeks', () => {
    const now = new Date('2026-10-18T23:59:59Z');
    expect(rankingWindow('today',now).end.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(rankingWindow('week',now).start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });
  it('rolls months across years', () => {
    expect(rankingWindow('month',new Date('2026-12-31')).end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it('excludes Family and rejects invalid paging and periods', () => {
    for(const query of ['type=family','offset=-1','offset=1.5','period=year','q='+ 'a'.repeat(81)]) expect(()=>rankingInput(new URLSearchParams(query))).toThrow();
  });
  it('defaults and preserves a literal search', () => {
    expect(rankingInput(new URLSearchParams('q=%25'))).toEqual({type:'wealth',period:'today',offset:0,q:'%'});
  });
});

it('accepts Game and uses its independently configured reward cycle', async () => {
  expect(rankingInput(new URLSearchParams('type=game'))).toMatchObject({type:'game',period:'today'});
  const db={reportingCyclePolicy:{findMany:async({where})=>{expect(where.module).toBe('GAME_RANKING');return [{days:15,revision:1,effectiveFrom:new Date('2026-11-01')}];}}};
  const window=await configuredRankingWindow(db,'game','month',new Date('2026-11-05'));
  expect(window.end.toISOString()).toBe('2026-11-16T00:00:00.000Z');
});
