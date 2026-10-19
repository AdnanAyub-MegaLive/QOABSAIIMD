import { rocketCrashAt, publicRocketState, rocketCashoutResult } from "./rocket.mjs";
import { roundTiming } from "./round-timing.mjs";
import { ledgerData } from "../wallet.js";
import { instantGames, resolveInstant } from "./instant-games.mjs";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { assertPlayer, GameError, serializeGame } from "./service.js";
import { sharedClock, sharedDuration, sharedOutcome, sharedTrivia } from "./shared-engine.mjs";
import { strictBets } from "./roulette/engine.mjs";
import { betByLabel,isBetWinner } from "./roulette/original-rules.mjs";
import {pizzaFoods,pizzaSettings} from "./pizza.mjs";
const receipt=e=>e?{id:e.id,status:e.status,amount:e.amount.toString(),input:e.input,answered:e.answer!==null,result:e.result}:null;
export function entryTotals(entries){const totals={};for(const e of entries){const parts=e.input.bets||{[e.input.choice||"round"]:e.amount};for(const [k,v] of Object.entries(parts))totals[k]=(BigInt(totals[k]||0)+BigInt(v)).toString();}return totals;}
export async function requireGameRoom(db,identity){
 const user=await assertPlayer(db,identity);
 if(!identity.roomId)throw new GameError("Open this game from an audio room.",403);
 const room=await db.audioRoom.findUnique({where:{roomId:identity.roomId}});
 if(!room||!["LIVE","IDLE"].includes(room.status)||room.isBlocked)throw new GameError("Room unavailable.",403);
 const member=await db.audioRoomMember.findUnique({where:{audioRoomId_userId:{audioRoomId:room.id,userId:user.id}}});
 if(!member||member.socketCount<=0)throw new GameError("Join the room before playing.",403);
 const ban=await db.audioRoomBan.findFirst({where:{audioRoomId:room.id,userId:user.id,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}});
 if(ban)throw new GameError("You cannot play in this room.",403);
 return user;
}
async function getDay(db,gameId,now,viewExistingRocket=false){
 if(typeof gameId!=="string")throw new GameError("Invalid game.");
 const gameRow=await db.gameDefinition.findUnique({where:{id:gameId}});
 if(!gameRow||gameRow.settings.engine==="external"||(gameRow.settings.status!=="active"&&!(viewExistingRocket&&gameRow.settings.engine==="rocket")))throw new GameError("Game paused or unavailable.",409);
 const date=new Date(now).toISOString().slice(0,10),id=`${gameId}:${date}`,settings=serializeGame(gameRow);
 if(gameRow.settings.status!=="active"){
   const existing=await db.sharedGameDay.findUnique({where:{id}});
   if(!existing)throw new GameError("Game paused or unavailable.",409);
   return {...existing,acceptingBets:false};
 }
 const day=await db.sharedGameDay.upsert({where:{id},create:{id,gameId,day:new Date(`${date}T00:00:00Z`),settings,seed:randomBytes(32).toString("hex"),durationMs:sharedDuration(settings)},update:{}});
 return {...day,acceptingBets:true};
}
export function accepted(game,input){
 const amount=input.amount;
 if(!Number.isSafeInteger(amount)||amount<1)throw new GameError("Choose a positive whole coin amount.");
 if(input.custom!==undefined&&typeof input.custom!=="boolean")throw new GameError("Invalid custom selection.");
 const choice=input.choice??null;
 const options={...Object.fromEntries(Object.entries(instantGames).map(([engine,spec])=>[engine,spec.choices])),flip:["heads","tails"],dice:["1","2","3","4","5","6"],rps:["rock","paper","scissors"],penalty:["left","centre","right"],teenpatti:["1","2","3"]};
 options.rocket=["board"];
 options.pizza=pizzaFoods.map(f=>f.id);
 let bets=null;
 if(game.engine==="roulette"){
   try{bets=strictBets(input.bets,Number.MAX_SAFE_INTEGER);}catch(e){throw new GameError(e.message);}
   if(Object.values(bets).reduce((a,b)=>a+b,0)!==amount)throw new GameError("Selected points do not match.");
 }else if(options[game.engine]&&!options[game.engine].includes(choice))throw new GameError("Choose a valid option.");
 if(amount<game.minBet||amount>game.maxBet)throw new GameError(`Bet must be ${game.minBet}–${game.maxBet} coins.`);
 return {amount,choice:options[game.engine]?choice:null,bets,custom:input.custom===true};
}
export async function enterSharedRound(identity,input,db=prisma){
 if(typeof input.id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id)||typeof input.dayId!=="string"||!Number.isInteger(input.slot))throw new GameError("Invalid round request.");
 return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "GameDefinition" WHERE id=${input.gameId} FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${identity.userId} FOR UPDATE`;
   await requireGameRoom(tx,identity);
   const suppliedDay=await tx.sharedGameDay.findUnique({where:{id:input.dayId}});
   if(!suppliedDay||suppliedDay.gameId!==input.gameId)throw new GameError("Unknown round.",409);
   const parsed=accepted(suppliedDay.settings,input),fingerprint=createHash("sha256").update(JSON.stringify({dayId:input.dayId,slot:input.slot,roomId:identity.roomId,...parsed})).digest("hex");
   const existing=await tx.sharedGameEntry.findUnique({where:{id:input.id}});
   if(existing){if(existing.userId!==identity.userId||existing.requestHash!==fingerprint)throw new GameError("Request ID conflict.",409);return receipt(existing);}
   const now=Date.now(),day=await getDay(tx,input.gameId,now),clock=sharedClock(day,now);
   if(input.dayId!==day.id||input.slot!==clock.slot||clock.phase!=="open")throw new GameError("Entry closed. Wait for the next round.",409);
   if(day.settings.engine==="rocket"&&await tx.sharedGameEntry.findFirst({where:{dayId:day.id,roomId:identity.roomId,slot:clock.slot,userId:identity.userId}}))throw new GameError("You are already aboard this flight.",409);
   const placed=await tx.sharedGameEntry.aggregate({where:{dayId:day.id,roomId:identity.roomId,slot:clock.slot,userId:identity.userId},_sum:{amount:true}});
   if((placed._sum.amount||0n)+BigInt(parsed.amount)>BigInt(day.settings.maxBet))throw new GameError("Total bets exceed this round's limit.",409);
   if(Date.now()>=clock.closesAt)throw new GameError("Entry closed. Wait for the next round.",409);
   const debit=await tx.user.updateMany({where:{id:identity.userId,coinBalance:{gte:BigInt(parsed.amount)}},data:{coinBalance:{decrement:BigInt(parsed.amount)}}});
   if(debit.count!==1)throw new GameError("Not enough coins in your application wallet.",409);
   await tx.walletTransaction.create({data:ledgerData({userId:identity.userId,type:"GAME_WAGER",direction:"DEBIT",title:`${day.settings.name} wager`,coins:BigInt(parsed.amount),referenceId:input.id,metadata:{gameId:input.gameId,roomId:identity.roomId,dayId:day.id,slot:clock.slot}})});
   return receipt(await tx.sharedGameEntry.create({data:{id:input.id,dayId:day.id,roomId:identity.roomId,slot:clock.slot,userId:identity.userId,amount:BigInt(parsed.amount),input:{...parsed,currency:"COINS"},requestHash:fingerprint,resolveAt:new Date(day.settings.engine==="rocket"?rocketCrashAt(day,clock.slot,sharedOutcome(day,identity.roomId,clock.slot).crashCents):clock.revealsAt)}}));
 });
}
export async function answerSharedRound(identity,input,db=prisma){
 if(typeof input.id!=="string")throw new GameError("Invalid entry.");
 return db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "SharedGameEntry" WHERE id=${input.id} FOR UPDATE`;
   await requireGameRoom(tx,identity);
   const entry=await tx.sharedGameEntry.findUnique({where:{id:input.id},include:{day:true}});
   if(!entry||entry.userId!==identity.userId||entry.roomId!==identity.roomId)throw new GameError("Entry not found.",404);
   const engine=entry.day.settings.engine;
   if(!["reaction","trivia"].includes(engine))throw new GameError("This game has no answer action.");
   const value=engine==="reaction"?"tap":input.answers;
   if(engine==="trivia"){
     const quiz=sharedTrivia(entry.day,entry.roomId,entry.slot,Number(entry.amount),entry.input.custom);
     if(!Array.isArray(value)||value.length!==quiz.questions.length||value.some(v=>!["0","1","2","3"].includes(v)))throw new GameError("Answer every question.");
   }
   if(entry.answer!==null){if(JSON.stringify(entry.answer.value)!==JSON.stringify(value))throw new GameError("Answer already recorded.",409);return receipt(entry);}
   const now=Date.now(),clock=sharedClock(entry.day,now);
   if(clock.slot!==entry.slot||clock.phase!=="playing"||entry.status!=="PENDING")throw new GameError("Answer window closed.",409);
   return receipt(await tx.sharedGameEntry.update({where:{id:entry.id},data:{answer:{value,at:now}}}));
 });
}
export async function cashOutRocket(identity,input,db=prisma){
 if(typeof input.id!=="string")throw new GameError("Invalid entry.");
 return db.$transaction(async tx=>{
   // Same lock order as automatic settlement: entry, then wallet owner.
   await tx.$queryRaw`SELECT id FROM "SharedGameEntry" WHERE id=${input.id} FOR UPDATE`;
   const entry=await tx.sharedGameEntry.findUnique({where:{id:input.id},include:{day:true}});
   if(!entry||entry.userId!==identity.userId||entry.roomId!==identity.roomId||entry.day.gameId!==input.gameId)throw new GameError("Entry not found.",404);
   if(entry.day.settings.engine!=="rocket")throw new GameError("This game has no cash-out action.");
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${identity.userId} FOR UPDATE`;
   await requireGameRoom(tx,identity);
   if(entry.status==="SETTLED"){
     if(entry.result?.cashedOut)return receipt(entry);
     throw new GameError("The rocket has crashed. Cash-out is closed.",409);
   }
   if(entry.status!=="PENDING")throw new GameError("Entry unavailable.",409);
   const now=Date.now(),outcome=sharedOutcome(entry.day,entry.roomId,entry.slot);
   let result;
   try{result=rocketCashoutResult(entry,now,outcome.crashCents);}catch(error){throw new GameError(error.message,409);}
   await settleEntry(tx,entry,result);
   return receipt({...entry,status:"SETTLED",result});
 });
}
export function resolveSharedEntry(entry){
 const day=entry.day,g=day.settings,input=entry.input,amount=Number(entry.amount),outcome=sharedOutcome(day,entry.roomId,entry.slot);
 let win=false,tie=false,payout=0,detail=outcome.result;
 if(g.engine==="rocket")return {currency:input.currency==="COINS"?"COINS":"PLAY_POINTS",bet:amount,payout:0,outcome:"loss",result:`Crashed at ${outcome.result}`,cashedOut:false,crashMultiplier:outcome.crashCents/100};
 if(instantGames[g.engine]&&g.engine!=="rps"){
   const resolved=resolveInstant(g,amount,input.choice,outcome.draw);
   payout=BigInt(resolved.payout);win=resolved.outcome==="win";tie=resolved.outcome==="push";detail=resolved.result;
 }else if(g.engine==="roulette"){payout=Object.entries(input.bets).reduce((sum,[label,n])=>sum+(isBetWinner(label,outcome.result)?BigInt(n)*BigInt(betByLabel[label].multiplier):0n),0n);win=payout>BigInt(amount);tie=payout===BigInt(amount);}
 else{
   if(g.engine==="teenpatti")win=outcome.winners.includes(input.choice);
   else if(g.engine==="rps"){const choices=["rock","paper","scissors"];tie=input.choice===outcome.result;win=(choices.indexOf(input.choice)-choices.indexOf(outcome.result)+3)%3===1;}
   else if(g.engine==="penalty")win=input.choice!==outcome.result;
   else if(g.engine==="reaction"){
     const opensAt=new Date(day.day).getTime()+entry.slot*day.durationMs,elapsed=(entry.answer?.at??Infinity)-(opensAt+roundTiming(day.settings).selectionSeconds*1000+outcome.delayMs);
     win=elapsed>=0&&elapsed<=(g.reactionWindowMs??1000);detail=Number.isFinite(elapsed)?elapsed<0?"Too early":`${elapsed} ms`:"No tap";
   }else if(g.engine==="trivia"){
     const quiz=sharedTrivia(day,entry.roomId,entry.slot,amount,input.custom),correct=quiz.questions.filter((q,i)=>entry.answer?.value?.[i]===q.answer).length;
     win=correct===quiz.questions.length;detail=`${correct}/${quiz.questions.length} correct`;
   }else win=input.choice===outcome.result;
   const multiplier=g.engine==="pizza"?pizzaSettings(g).pizzaReturns[pizzaFoods.findIndex(f=>f.id===input.choice)]:g.engine==="flip"?g.payoutMultiplier:g.pointReturnMultiplier??(g.engine==="dice"?6:g.engine==="teenpatti"?3:2);
   payout=tie?BigInt(amount):win?BigInt(amount)*BigInt(Math.round(multiplier*100))/100n:0n;
 }
 return {currency:input.currency==="COINS"?"COINS":"PLAY_POINTS",bet:amount,payout:payout<=BigInt(Number.MAX_SAFE_INTEGER)?Number(payout):payout.toString(),outcome:win?"win":tie?"push":"loss",result:detail};
}
async function settleEntry(tx,entry,result){
   if(entry.input.currency==="COINS"){
     const payout=BigInt(result.payout);
     if(payout>0n){
       await tx.user.update({where:{id:entry.userId},data:{coinBalance:{increment:payout}}});
       await tx.walletTransaction.create({data:ledgerData({userId:entry.userId,type:"GAME_PAYOUT",direction:"CREDIT",title:`${entry.day.settings.name} payout`,coins:payout,referenceId:entry.id,metadata:{gameId:entry.day.gameId,roomId:entry.roomId}})});
     }
     const user=await tx.user.findUnique({where:{id:entry.userId}});
     const payload={...result,id:entry.id,uid:user.publicId,nickname:user.name,gameId:entry.day.gameId,gameName:entry.day.settings.name,roomId:entry.roomId,choice:entry.input.choice,bets:entry.input.bets,revision:entry.day.settings.revision,settings:entry.day.settings,status:"settled",createdAt:entry.createdAt.toISOString()};
     await tx.gameRound.create({data:{id:entry.id,userId:entry.userId,gameId:entry.day.gameId,requestHash:entry.requestHash,payload,createdAt:entry.createdAt}});
     await tx.gameLog.create({data:{userId:entry.userId,gameName:entry.day.settings.name,wager:entry.amount,payout,result:result.outcome,referenceId:entry.id}});
   }else{
     // Existing free-point wagers must never turn into real coin payouts.
     await tx.gamePlayAccount.update({where:{userId:entry.userId},data:{points:{increment:BigInt(result.payout)}}});
   }
   await tx.sharedGameEntry.update({where:{id:entry.id},data:{status:"SETTLED",result}});
}

export async function settleSharedGames(db=prisma,now=new Date(),where={}){
 const due=await db.sharedGameEntry.findMany({where:{status:"PENDING",resolveAt:{lte:now},...where},orderBy:{resolveAt:"asc"},take:200,select:{id:true}});
 for(const item of due)await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "SharedGameEntry" WHERE id=${item.id} FOR UPDATE`;
   const entry=await tx.sharedGameEntry.findUnique({where:{id:item.id},include:{day:true}});
   if(!entry||entry.status!=="PENDING")return;
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${entry.userId} FOR UPDATE`;
   const result=resolveSharedEntry(entry);
   await settleEntry(tx,entry,result);
 });
}
export async function sharedSnapshot(identity,input,db=prisma){
 await requireGameRoom(db,identity);
 await settleSharedGames(db,new Date(),{userId:identity.userId});
 const now=Date.now(),day=await getDay(db,input.gameId,now,true),clock=sharedClock(day,now);
 const entries=await db.sharedGameEntry.findMany({where:{dayId:day.id,roomId:identity.roomId,slot:clock.slot},select:{userId:true,amount:true,input:true}});
 const mineEntries=await db.sharedGameEntry.findMany({where:{dayId:day.id,roomId:identity.roomId,slot:clock.slot,userId:identity.userId},orderBy:[{createdAt:"asc"},{id:"asc"}]});
 const mine=mineEntries.find(e=>!e.answer)||mineEntries.at(-1);
 const account=await db.user.findUnique({where:{id:identity.userId}});
 const recentEntries=await db.sharedGameEntry.findMany({where:{userId:identity.userId,roomId:identity.roomId,day:{gameId:input.gameId}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:10});
 let challenge=null;
 if(mine&&["playing","reveal"].includes(clock.phase)){
   if(day.settings.engine==="trivia"){
     const quiz=sharedTrivia(day,identity.roomId,clock.slot,Number(mine.amount),mine.input.custom);
     challenge={tier:quiz.tier,questions:quiz.questions.map(({id,text,options,answer})=>({id,text,options,...(clock.phase==="reveal"?{answer}:{})}))};
   }else if(day.settings.engine==="reaction")challenge={readyAt:clock.closesAt+sharedOutcome(day,identity.roomId,clock.slot).delayMs};
 }
 const history=[];for(let slot=clock.slot-1;slot>=Math.max(0,clock.slot-5);slot--)history.push({roundNumber:slot+1,...sharedOutcome(day,identity.roomId,slot)});
 const totals=entryTotals(entries);
 const rocket=day.settings.engine==="rocket"?publicRocketState(day,clock.slot,sharedOutcome(day,identity.roomId,clock.slot).crashCents,now):null;
 return {serverTime:now,rocket,acceptingBets:day.acceptingBets,dayId:day.id,roomId:identity.roomId,game:day.settings,...clock,currency:"COINS",availableCoins:account.coinBalance.toString(),mine:receipt(mine),mineEntries:mineEntries.map(receipt),myTotal:mineEntries.reduce((n,e)=>n+e.amount,0n).toString(),myTotals:entryTotals(mineEntries),recentEntries:recentEntries.map(receipt),participants:new Set(entries.map(e=>e.userId)).size,totalPoints:entries.reduce((n,e)=>n+e.amount,0n).toString(),totals,challenge,history,outcome:(["reveal","reset"].includes(clock.phase)||rocket?.crashed)?sharedOutcome(day,identity.roomId,clock.slot):null};
}
