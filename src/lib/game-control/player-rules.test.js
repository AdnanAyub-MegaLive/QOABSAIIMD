import {it,expect} from 'vitest';
import {playerRules} from './player-rules.mjs';
import {resolveInstant} from './instant-games.mjs';
import {accepted} from './shared-games.js';
import {vi} from 'vitest';
vi.mock('../prisma.js',()=>({prisma:{}}));
it.each(['roulette','flip','highlow','wheel','dragon','slots','dice','rps','penalty','teenpatti','reaction','trivia','rocket','pizza'])('documents the %s player flow and balance-only limit',engine=>{
 const rules=playerRules({engine});expect(rules.length).toBeGreaterThan(2);expect(rules.join(' ')).toContain('available balance');expect(rules.join(' ')).not.toContain('undefined');
});
it('uses configured payouts and reaction time rather than outdated fixed values',()=>{
 expect(playerRules({engine:'dice',pointReturnMultiplier:4}).join(' ')).toContain('4×');
 expect(playerRules({engine:'reaction',reactionWindowMs:250}).join(' ')).toContain('250 ms');
 expect(playerRules({engine:'teenpatti'}).join(' ')).toContain('Hand 1, 2 or 3');
});
it.each([['flip','heads'],['rocket','board'],['dice','1'],['rps','rock'],['penalty','left'],['teenpatti','1'],['pizza','tomato'],['trivia',null],['reaction',null],['highlow','low'],['wheel','spin'],['dragon','dragon'],['slots','spin']])('%s accepts a whole-coin stake above its old cap', (engine,choice)=>{
 expect(accepted({engine,minBet:10,maxBet:1000},{amount:100000001,choice}).amount).toBe(100000001);
});
it('accepts roulette totals above the old cap and still rejects mismatched amounts',()=>{
 expect(accepted({engine:'roulette',maxBet:1000},{amount:200000002,bets:{Red:100000001,Black:100000001}}).amount).toBe(200000002);
 expect(()=>accepted({engine:'roulette'},{amount:100,bets:{Red:101}})).toThrow();
});
it('uses exact integer arithmetic for large fractional-multiplier payouts',()=>{
 const stake=9007199254740991;
 const result=resolveInstant({engine:'highlow'},stake,'low',0);
 expect(BigInt(result.payout)).toBe(BigInt(stake)*190n/100n);
});
