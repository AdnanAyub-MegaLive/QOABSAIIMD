import { prisma } from './prisma.js';
import { requireRankingRoom } from './room-rankings.js';
import { rocketError } from './room-rocket-contract.js';
import { rocketSnapshot, displayRocketRewards } from './room-rocket.js';

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
  if (!campaignId || campaignId.length > 100 || !/^LV-[123]$/.test(stageId ?? '') || !Number.isInteger(limit) || limit < 1 || limit > 50) throw rocketError('VALIDATION_ERROR', 'Provide campaignId, stageId (LV-1 to LV-3), and limit 1–50.');
  await requireRocketRoom(db, roomId, user);
  const launch = await db.roomRocketLaunch.findUnique({ where: { campaignId_roomId_level: { campaignId, roomId, level: Number(stageId.slice(3)) } } });
  if (!launch) return { title: `Rocket ${stageId} rewards`, myRewards: [], recipients: [], nextCursor: null, payoutStatus: 'NOT_LAUNCHED' };
  let offset = 0;
  if (query.get('cursor')) {
    try { const cursor = JSON.parse(Buffer.from(query.get('cursor'), 'base64url').toString()); if (cursor.launchId !== launch.id || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > launch.winners.length) throw new Error(); offset = cursor.offset; }
    catch { throw rocketError('VALIDATION_ERROR', 'This results cursor is invalid.'); }
  }
  const page = launch.winners.slice(offset, offset + limit);
  const users = await db.user.findMany({ where: { id: { in: page.map(w => w.userId) }, deletedAt: null, status: 'ACTIVE' }, select: { id: true, publicId: true, name: true, profileImage: true } });
  const recipients = [];
  for (const winner of page) {
    const found = users.find(u => u.id === winner.userId);
    const identity = found ? { publicId: found.publicId, name: found.name, profileImage: found.profileImage } : null;
    recipients.push({ rank: winner.rank, group: winner.group, user: identity, rewards: await displayRocketRewards(db, winner.rewards, origin) });
  }
  const mine = launch.winners.find(w => w.userId === user.id);
  return { title: `Rocket ${stageId} rewards`, launchId: launch.id, payoutStatus: launch.paidAt ? 'PAID' : 'PENDING', myRewards: await displayRocketRewards(db, mine?.rewards ?? [], origin), recipients, nextCursor: offset + limit < launch.winners.length ? Buffer.from(JSON.stringify({ launchId: launch.id, offset: offset + limit })).toString('base64url') : null };
}
