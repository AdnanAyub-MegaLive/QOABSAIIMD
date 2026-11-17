import {pizzaBonus,pizzaBonusReady} from './pizza.mjs';
import {seededRandom,sharedOutcome} from './shared-engine.mjs';

// Caller holds GameDefinition's lock. Freeze once before accepting the first bet;
// every room and every later settlement uses this durable result.
export async function ensurePizzaRound(tx,day,slot){
 const id=`${day.id}:${slot}`;
 const existing=await tx.pizzaRound.findUnique({where:{id}});
 if(existing)return existing.outcome;
 const pool=await tx.pizzaPool.upsert({where:{gameId:day.gameId},create:{gameId:day.gameId},update:{}});
 const bonus=pizzaBonusReady(pool,day.settings);
 const outcome=bonus?pizzaBonus(seededRandom(day.seed,`pizza-bonus:${slot}`)):sharedOutcome(day,'application-v1',slot);
 if(bonus)await tx.pizzaPool.update({where:{gameId:day.gameId},data:{progress:0n}});
 await tx.pizzaRound.create({data:{id,gameId:day.gameId,dayId:day.id,slot,outcome}});
 return outcome;
}
export async function readPizzaOutcome(db,day,roomId,slot){
 const row=await db.pizzaRound.findUnique({where:{id:`${day.id}:${slot}`}});
 return row?.outcome??sharedOutcome(day,roomId,slot);
}
export async function creditPizzaPool(tx,entry,result){
 const net=entry.amount-BigInt(result.payout);
 await tx.pizzaPool.upsert({where:{gameId:entry.day.gameId},create:{gameId:entry.day.gameId,balance:net,progress:net},update:{balance:{increment:net},progress:{increment:net}}});
}
