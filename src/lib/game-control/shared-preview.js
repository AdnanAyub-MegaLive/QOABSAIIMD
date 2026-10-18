import {randomBytes} from "node:crypto";
import {sharedClock,sharedDuration,sharedOutcome,sharedTrivia} from "./shared-engine.mjs";
import {accepted,resolveSharedEntry,entryTotals} from "./shared-games.js";
import {GameError,serializeGame} from "./service.js";
// Isolated, bounded admin preview: no membership, wallet or production point writes.
const previews=new Map();
const view=e=>e?{id:e.id,status:e.status,amount:String(e.amount),input:e.input,answered:!!e.answer,result:e.result}:null;
export function previewRound(owner,gameRow,input,now=Date.now()){
 const key=`${owner}:${gameRow.id}`,date=new Date(now).toISOString().slice(0,10);
 for(const [k,v] of previews)if(now-v.seen>3600000)previews.delete(k);
 let state=previews.get(key);
 if(!state||state.day.id!==`${gameRow.id}:${date}`||state.day.settings.revision!==gameRow.revision){
  if(previews.size>=200)previews.delete(previews.keys().next().value);
  const game={...serializeGame(gameRow),status:"active"};
  state={day:{id:`${gameRow.id}:${date}`,day:new Date(`${date}T00:00:00Z`),settings:game,durationMs:sharedDuration(game),seed:randomBytes(32).toString("hex")},entries:[],points:10000n,seen:now};previews.set(key,state);
 }
 state.seen=now;
 const {day}=state,clock=sharedClock(day,now),roomId="admin-preview";
 for(const e of state.entries)if(e.status==="PENDING"&&e.resolveAt<=now){e.result=resolveSharedEntry(e);state.points+=BigInt(e.result.payout);e.status="SETTLED";}
 if(input.action==="shared-enter"){
  const parsed=accepted(day.settings,input),old=state.entries.find(e=>e.id===input.id);
  if(old){if(old.slot!==input.slot||JSON.stringify(old.input)!==JSON.stringify(parsed))throw new GameError("Request ID conflict.",409);return view(old);}
  if(input.dayId!==day.id||input.slot!==clock.slot||clock.phase!=="open")throw new GameError("Entry closed. Wait for the next round.",409);

  if(state.points<parsed.amount)throw new GameError("Use Free refill.",409);
  const e={id:input.id,day,roomId,slot:clock.slot,amount:parsed.amount,input:parsed,answer:null,status:"PENDING",result:null,resolveAt:clock.revealsAt};
  state.points-=BigInt(parsed.amount);state.entries.push(e);return view(e);
 }
 if(input.action==="shared-answer"){
  const e=state.entries.find(e=>e.id===input.id);
  if(!e)throw new GameError("Entry not found.",404);
  const engine=day.settings.engine,value=engine==="reaction"?"tap":input.answers;
  if(!["reaction","trivia"].includes(engine))throw new GameError("No answer action.");
  if(engine==="trivia"&&(!Array.isArray(value)||value.length!==sharedTrivia(day,roomId,e.slot,e.amount,e.input.custom).questions.length||value.some(a=>!["0","1","2","3"].includes(a))))throw new GameError("Answer every question.");
  if(e.answer){if(JSON.stringify(e.answer.value)!==JSON.stringify(value))throw new GameError("Answer already recorded.",409);return view(e);}
  if(e.slot!==clock.slot||clock.phase!=="playing")throw new GameError("Answer window closed.",409);
  e.answer={value,at:now};return view(e);
 }
 if(input.action==="refill")state.points=state.points<10000n?10000n:state.points;
 const mineEntries=state.entries.filter(e=>e.slot===clock.slot),mine=mineEntries.find(e=>!e.answer)||mineEntries.at(-1),revealed=["reveal","reset"].includes(clock.phase);
 let challenge=null;
 if(mine&&["playing","reveal"].includes(clock.phase)){
  if(day.settings.engine==="reaction")challenge={readyAt:clock.closesAt+sharedOutcome(day,roomId,clock.slot).delayMs};
  if(day.settings.engine==="trivia"){const quiz=sharedTrivia(day,roomId,clock.slot,mine.amount,mine.input.custom);challenge={tier:quiz.tier,questions:quiz.questions.map(({answer,...q})=>({...q,...(revealed?{answer}:{})}))};}
 }
 const history=[];for(let slot=clock.slot-1;slot>=Math.max(0,clock.slot-5);slot--)history.push({roundNumber:slot+1,...sharedOutcome(day,roomId,slot)});
 return {serverTime:now,dayId:day.id,roomId,game:day.settings,...clock,availablePoints:String(state.points),mine:view(mine),mineEntries:mineEntries.map(view),myTotal:String(mineEntries.reduce((n,e)=>n+BigInt(e.amount),0n)),myTotals:entryTotals(mineEntries),recentEntries:state.entries.slice(-10).reverse().map(view),participants:mine?1:0,totalPoints:String(mineEntries.reduce((n,e)=>n+BigInt(e.amount),0n)),totals:entryTotals(mineEntries),challenge,history,outcome:revealed?sharedOutcome(day,roomId,clock.slot):null};
}
