import { weightedOutcomeDraw } from "./outcome-weights.mjs";
import { roundTiming } from "./round-timing.mjs";
import { instantGames, resolveInstant } from "./instant-games.mjs";
import { createHmac } from "node:crypto";
import { shuffled, triviaTier } from "./trivia-plan.mjs";
import { triviaPools } from "./trivia-rounds.mjs";
import { rankHand } from "./teen-patti.mjs";
import { weightedPocket } from "./roulette/engine.mjs";
import {pizzaSettings,pizzaResult} from "./pizza.mjs";
export const DAY_MS=86400000;
export function sharedDuration(game){return Object.values(roundTiming(game)).reduce((sum, seconds)=>sum+seconds,0)*1000;}
export function sharedClock(day, now=Date.now()){
 const start=new Date(day.day).getTime(),duration=day.durationMs,elapsed=Math.max(0,now-start),slots=Math.floor(DAY_MS/duration);
 const timing=roundTiming(day.settings);
 const slot=Math.min(Math.floor(elapsed/duration),slots-1),opensAt=start+slot*duration,closesAt=opensAt+timing.selectionSeconds*1000,revealsAt=opensAt+duration-timing.resultSeconds*1000,endsAt=opensAt+duration;
 const phase=now>=start+DAY_MS||now>=endsAt?"reset":now<closesAt?"open":now<revealsAt?"playing":"reveal";
 return {slot,roundNumber:slot+1,totalRounds:Math.min(slots,Math.floor(elapsed/duration)),opensAt,closesAt,revealsAt,endsAt,resetAt:start+DAY_MS,phase};
}
export function seededRandom(seed,scope){let counter=0;return max=>{if(!Number.isInteger(max)||max<1||max>4294967296)throw new Error("Invalid random range");const bound=Math.floor(4294967296/max)*max;let n;do{n=createHmac("sha256",seed).update(`${scope}:${counter++}`).digest().readUInt32BE(0);}while(n>=bound);return n%max;};}
// Persist the scope in each daily snapshot so deployed changes never reroll existing wagers.
function outcomeScope(day, roomId) { return day.settings.outcomeScope === "application-v1" ? "application-v1" : roomId; }
export function sharedOutcome(day,roomId,slot){
 const g=day.settings,random=seededRandom(day.seed,`${outcomeScope(day,roomId)}:${slot}`);
 if(instantGames[g.engine] && g.engine!=="rps"){const draw=g.outcomeWeights?weightedOutcomeDraw(g,random):random(instantGames[g.engine].drawSize);return {result:resolveInstant(g,100,instantGames[g.engine].choices[0],draw).result,draw};}
 if(g.engine==="rocket"){const crashCents=weightedOutcomeDraw(g,random);return {result:`${(crashCents/100).toFixed(2)}×`,crashCents};}
 if(g.engine==="pizza"){const settings=pizzaSettings(g);return {result:pizzaResult(g,random(settings.pizzaWeights.reduce((a,b)=>a+b,0)))};}
 if(g.engine==="roulette")return {result:weightedPocket(g.pocketWeights,random(g.pocketWeights.reduce((a,b)=>a+b,0)))};
 if(g.engine==="flip")return {result:random(10000)<Math.round((g.winProbability??50)*100)?"heads":"tails"};
 if(g.engine==="dice")return {result:String((g.outcomeWeights?weightedOutcomeDraw(g,random):random(6))+1)};
 if(g.engine==="rps")return {result:["rock","paper","scissors"][g.outcomeWeights?weightedOutcomeDraw(g,random):random(3)]};
 if(g.engine==="penalty")return {result:["left","centre","right"][g.outcomeWeights?weightedOutcomeDraw(g,random):random(3)]};
 if(g.engine==="reaction")return {delayMs:2000+random(3000)};
 if(g.engine==="trivia")return {result:"Answers revealed"};
 if(g.engine==="teenpatti"){
   const deck=shuffled(Array.from({length:52},(_,i)=>i),random),hands=[deck.slice(0,3),deck.slice(3,6),deck.slice(6,9)],ranks=hands.map(rankHand);
   const compare=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;return 0;};
   let best=0;for(let i=1;i<3;i++)if(compare(ranks[i],ranks[best])>0)best=i;
   // Preserve the dealt cards and ties; position the sole strongest hand using saved weights.
   if(g.outcomeWeights && ranks.filter(rank=>compare(rank,ranks[best])===0).length===1){
     const target=weightedOutcomeDraw(g,random);
     [hands[best],hands[target]]=[hands[target],hands[best]];
     [ranks[best],ranks[target]]=[ranks[target],ranks[best]];
     best=target;
   }
   const winners=ranks.flatMap((r,i)=>compare(r,ranks[best])===0?[String(i+1)]:[]);
   const labels=["","High card","Pair","Colour","Sequence","Pure sequence","Trail"];
   return {result:winners.join(","),winners,hands:hands.map((cards,i)=>({label:labels[ranks[i][0]],cards:cards.map(c=>`${({11:"J",12:"Q",13:"K",14:"A"})[c%13+2]||c%13+2}${["♠","♥","♦","♣"][Math.floor(c/13)]}`)}))};
 }
 throw new Error("Unsupported room game");
}
export function sharedTrivia(day,roomId,slot,amount,custom){
 const {tier,count}=triviaTier(amount,custom),pool=triviaPools[tier],cycle=Math.floor(slot*count/pool.length),offset=slot*count%pool.length;
 const all=shuffled(pool,seededRandom(day.seed,`${outcomeScope(day,roomId)}:trivia:${tier}:${cycle}`));
 // Pool sizes divide the supported round sizes: no repeats until each pool is exhausted.
 return {tier,questions:all.slice(offset,offset+count).map((q,i)=>{const options=shuffled([q.correct,...q.wrong],seededRandom(day.seed,`${outcomeScope(day,roomId)}:${slot}:${tier}:${i}:options`));return {id:q.id,text:q.text,options,answer:String(options.indexOf(q.correct))};})};
}
