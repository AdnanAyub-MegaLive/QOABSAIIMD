import {greedyBonus,greedyBonusReady} from './greedy.mjs';
import {seededRandom,sharedOutcome} from './shared-engine.mjs';

// Caller holds GameDefinition's lock. Freeze once before accepting the first bet;
// every room and every later settlement uses this durable result.
export async function ensureGreedyRound(tx,day,slot){
 const id=`${day.id}:${slot}`;
 const existing=await tx.greedyRound.findUnique({where:{id}});
 if(existing)return existing.outcome;
 const pool=await tx.greedyPool.upsert({where:{gameId:day.gameId},create:{gameId:day.gameId},update:{}});
 const bonus=greedyBonusReady(pool,day.settings);
 const outcome=bonus?greedyBonus(seededRandom(day.seed,`greedy-bonus:${slot}`)):sharedOutcome(day,'application-v1',slot);
 if(bonus)await tx.greedyPool.update({where:{gameId:day.gameId},data:{progress:0n}});
 await tx.greedyRound.create({data:{id,gameId:day.gameId,dayId:day.id,slot,outcome}});
 return outcome;
}
export async function readGreedyOutcome(db,day,roomId,slot){
 const row=await db.greedyRound.findUnique({where:{id:`${day.id}:${slot}`}});
 return row?.outcome??sharedOutcome(day,roomId,slot);
}
export async function creditGreedyPool(tx,entry,result){
 const net=entry.amount-BigInt(result.payout);
 await tx.greedyPool.upsert({where:{gameId:entry.day.gameId},create:{gameId:entry.day.gameId,balance:net,progress:net},update:{balance:{increment:net},progress:{increment:net}}});
}
