import {it,expect,vi} from 'vitest';
vi.mock('../prisma.js',()=>({prisma:{}}));
vi.mock('../mobile-session-state.js',()=>({assertMobileSession:vi.fn()}));
import {instantGames,resolveInstant} from './instant-games.mjs';
import {sharedOutcome} from './shared-engine.mjs';
import {resolveSharedEntry} from './shared-games.js';
import {validateGame} from './rules.mjs';
import {previewRound} from './shared-preview.js';
const totals={highlow:570,wheel:1900,dragon:16120,slots:6000,rps:290};
for(const [engine,spec] of Object.entries(instantGames)){
 it(`${engine} exhaustively preserves payouts for every possible choice and draw`,()=>{
  for(const choice of spec.choices){let total=0;for(let draw=0;draw<spec.drawSize;draw++){
   const r=resolveInstant({engine,revision:1},100,choice,draw);total+=r.payout;expect(Number.isSafeInteger(r.payout)).toBe(true);
  }expect(total).toBe(totals[engine]);}
 });
 it(`${engine} shares outcomes across viewers and survives a restart`,()=>{
  const game=validateGame({id:spec.id,name:spec.name,engine,status:'active',minBet:10,maxBet:1000});
  const day={id:'test',gameId:spec.id,day:new Date('2026-10-18'),durationMs:40000,settings:game,seed:'test-secret'};
  expect(sharedOutcome(day,'room',9)).toEqual(sharedOutcome(structuredClone(day),'room',9));
  const entry={day,roomId:'room',slot:9,amount:100n,input:{choice:spec.choices[0],currency:'COINS'}};
  expect(resolveSharedEntry(entry).currency).toBe('COINS');expect(resolveSharedEntry(entry)).toEqual(resolveSharedEntry(structuredClone(entry)));
 });
 it(`${engine} previews the shared result without revealing it before the clock`,()=>{
  const settings=validateGame({id:spec.id,name:spec.name,engine,status:'paused',minBet:10,maxBet:1000});
  const row={id:spec.id,revision:1,settings},start=Date.parse('2026-10-18T00:00:00Z');
  const before=previewRound(engine,row,{action:'shared-state'},start+1000);
  expect(before.outcome).toBeNull();
  previewRound(engine,row,{action:'shared-enter',id:`${engine}-test`,dayId:before.dayId,slot:before.slot,amount:100,choice:spec.choices[0]},start+2000);
  const after=previewRound(engine,row,{action:'shared-state'},start+31000);
  expect(after.mine.status).toBe('SETTLED');expect(after.outcome).toBeTruthy();
 });
}
