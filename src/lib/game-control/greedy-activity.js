import {Prisma} from '@prisma/client';
import {prisma} from '../prisma.js';
import {requireGameRoom} from './shared-games.js';
import {assertGameAccess,GameError} from './service.js';

export async function greedyActivity(identity,input,db=prisma,now=new Date()){
 const user=await requireGameRoom(db,identity);
 await assertGameAccess(db,user,input.gameId,'view');
 const game=await db.gameDefinition.findUnique({where:{id:input.gameId}});
 if(!['greedy','pizza','teenpatti'].includes(game?.settings?.engine)||!input.action.startsWith(`${game.settings.engine}-`))throw new GameError('Invalid game activity.');
 const since=new Date(+now-86400000);
 if(input.action.endsWith('-ranking')){
  const rows=await db.$queryRaw(Prisma.sql`SELECT u."publicId", u.name,
   SUM(COALESCE((e.result->>'payout')::numeric,0))::text AS payout
   FROM "SharedGameEntry" e JOIN "SharedGameDay" d ON d.id=e."dayId" JOIN "User" u ON u.id=e."userId"
   WHERE d."gameId"=${input.gameId} AND e.status='SETTLED' AND e.input->>'currency'='COINS'
    AND e."resolveAt">=${since.toISOString()}::timestamp AND e."resolveAt"<=${now.toISOString()}::timestamp AND u."deletedAt" IS NULL AND u.status='ACTIVE'
   GROUP BY u.id,u."publicId",u.name HAVING SUM(COALESCE((e.result->>'payout')::numeric,0))>0
   ORDER BY SUM(COALESCE((e.result->>'payout')::numeric,0)) DESC,u."publicId" ASC LIMIT 100`);
  return {since:since.toISOString(),until:now.toISOString(),rows};
 }
 const page=Number.isInteger(input.page)&&input.page>=0&&input.page<=10000?input.page:0;
 const entries=await db.sharedGameEntry.findMany({where:{userId:identity.userId,day:{gameId:input.gameId},createdAt:{gte:since,lte:now}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:page*50,take:51,select:{id:true,amount:true,input:true,result:true,status:true,createdAt:true,slot:true,day:{select:{settings:true}}}});
 return {since:since.toISOString(),until:now.toISOString(),page,hasMore:entries.length>50,rows:entries.slice(0,50).map(e=>({id:e.id,amount:String(e.amount),input:e.input,result:e.result,status:e.status,createdAt:e.createdAt.toISOString(),roundNumber:(e.day.settings.scheduleRoundOffset||0)+e.slot+1}))};
}
