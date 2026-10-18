import {describe,it,expect} from "vitest";
import {DAY_MS,sharedClock,sharedDuration,sharedOutcome,sharedTrivia} from "./shared-engine.mjs";
const start=Date.parse("2026-10-18T00:00:00Z");
const day={day:new Date(start),durationMs:40000,seed:"private-test-seed",settings:{engine:"teenpatti"}};
describe("shared room rounds",()=>{
 it("advances empty rounds without a timer or player",()=>{
  expect(sharedClock(day,start+400000)).toMatchObject({slot:10,totalRounds:10,phase:"open"});
  expect(sharedClock(day,start+20000).phase).toBe("playing");
  expect(sharedClock(day,start+30000).phase).toBe("reveal");
 });
 it("resets the counter each UTC day",()=>{
  expect(sharedClock(day,start+DAY_MS).phase).toBe("reset");
  expect(sharedClock({...day,day:new Date(start+DAY_MS)},start+DAY_MS)).toMatchObject({slot:0,totalRounds:0});
 });
 it("does not open a truncated trivia round at midnight",()=>{
  const d={...day,durationMs:sharedDuration({engine:"trivia",triviaSeconds:20})};
  expect(sharedClock(d,start+DAY_MS-1).phase).toBe("reset");
 });
 it("returns identical hands for every viewer and restart",()=>{
  const a=sharedOutcome(day,"ROOM-1",10);
  expect(sharedOutcome({...day},"ROOM-1",10)).toEqual(a);
  expect(a.hands.flatMap(h=>h.cards)).toHaveLength(9);
  expect(new Set(a.hands.flatMap(h=>h.cards)).size).toBe(9);
  expect(a.winners.length).toBeGreaterThan(0);
  expect(sharedOutcome(day,"ROOM-2",10)).not.toEqual(a);
 });
 it("uses the same trivia questions for the same difficulty and avoids repeats until exhausted",()=>{
  const ids=[];for(let slot=0;slot<6;slot++){
   const quiz=sharedTrivia(day,"ROOM-1",slot,2000,true);
   expect(quiz.questions).toHaveLength(5);
   expect(sharedTrivia(day,"ROOM-1",slot,3000,true)).toEqual(quiz);
   ids.push(...quiz.questions.map(q=>q.id));
  }
  expect(new Set(ids).size).toBe(30);
 });
 it.each(["flip","dice","rps","penalty","reaction","roulette"])("keeps %s deterministic",engine=>{
  const d={...day,settings:{engine,pocketWeights:Array(37).fill(1)}};
  expect(sharedOutcome(d,"ROOM-1",3)).toEqual(sharedOutcome(d,"ROOM-1",3));
 });
});
