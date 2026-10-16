import { describe, it, expect } from 'vitest';
import { rankingInput, rankingWindow } from './ranking-contract.js';
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
