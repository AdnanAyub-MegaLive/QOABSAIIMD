import { prisma } from './prisma.js';
import { requireRankingRoom } from './room-rankings.js';
import { rocketError } from './room-rocket-contract.js';
import { rocketSnapshot, displayRocketRewards, rocketRecipients, rocketLaunchWinners } from './room-rocket.js';

export async function requireRocketRoom(db, roomId, user) {
  const room = await requireRankingRoom(db, roomId, user);
  const member = await db.audioRoomMember.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId: user.id } } });
  if (!member?.socketCount || room.status !== 'LIVE') throw rocketError('JOIN_ROOM_FIRST', 'Join this room to view Room Rocket.', 403);
  return room;
}
export async function getRoomRocket(roomId, user, origin, db = prisma) {
  return db.$transaction(async tx => {
    await requireRocketRoom(tx, roomId, user);
    const snapshot = await rocketSnapshot(tx, roomId);
    if (!snapshot) throw rocketError('ROCKET_DISABLED', 'Room Rocket is not currently enabled.', 409);
    for (const stage of snapshot.stages) {
      for (const group of Object.keys(stage.rewards)) stage.rewards[group] = await displayRocketRewards(tx, stage.rewards[group], origin);
    }
    return snapshot;
  });
}
export async function getRoomRocketResults(roomId, user, query, origin, db = prisma) {
  const campaignId = query.get('campaignId'), stageId = query.get('stageId');
  const limit = Number(query.get('limit') ?? 20);
  if ((!query.get('launchId') && !query.get('cursor') && (!campaignId || !stageId)) || (campaignId && campaignId.length > 100) || (stageId && !/^LV-[123]$/.test(stageId)) || !Number.isInteger(limit) || limit < 1 || limit > 50) throw rocketError('VALIDATION_ERROR', 'Provide campaignId, stageId (LV-1 to LV-3), and limit 1–50.');
  await requireRocketRoom(db, roomId, user);
  let offset=0,cursor=null;
  if(query.get('cursor')){
    try{cursor=JSON.parse(Buffer.from(query.get('cursor'),'base64url').toString());if(typeof cursor.launchId!=='string'||!Number.isInteger(cursor.offset)||cursor.offset<0)throw Error();offset=cursor.offset;}
    catch{throw rocketError('VALIDATION_ERROR','This results cursor is invalid.');}
  }
  const cycle=query.has('cycle')?Number(query.get('cycle')):null;
  if(cycle!==null && (!Number.isSafeInteger(cycle)||cycle<0))throw rocketError('VALIDATION_ERROR','Provide a valid Rocket cycle.');
  const launch=await db.roomRocketLaunch.findFirst({where:{...(campaignId?{campaignId}:{}),roomId,...(stageId?{level:Number(stageId.slice(3))}:{}),...(cycle!==null?{cycle}:{}),...((cursor?.launchId||query.get('launchId'))?{id:cursor?.launchId||query.get('launchId')}:{})},orderBy:{cycle:'desc'}});
  const winners = launch ? rocketLaunchWinners(launch) : [];
  if(cursor && (!launch || offset>winners.length))throw rocketError('VALIDATION_ERROR','This results cursor is invalid.');
  if (!launch) return { title: `Rocket ${stageId} rewards`, myRewards: [], recipients: [], nextCursor: null, payoutStatus: 'NOT_LAUNCHED' };
  const recipients = await rocketRecipients(db, winners.slice(offset, offset + limit), origin);
  const mine = winners.find(w => w.userId === user.id);
  return { title: `Rocket LV-${launch.level} rewards`, grabClosesAt: launch.grabClosesAt?.toISOString() ?? null, finalized: Boolean(launch.winnersFinalizedAt || !launch.grabClosesAt), grabOpen: Boolean(launch.grabClosesAt && !launch.winnersFinalizedAt && launch.grabClosesAt > new Date()), launchId: launch.id, cycle:launch.cycle, payoutStatus: launch.paidAt ? 'PAID' : 'PENDING', myRewards: await displayRocketRewards(db, mine?.rewards ?? [], origin), recipients, nextCursor: offset + limit < winners.length ? Buffer.from(JSON.stringify({ launchId: launch.id, offset: offset + limit })).toString('base64url') : null };
}
