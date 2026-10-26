import { roomAccessCheck } from './room-access-check.js';

// Short navigation hint, never admission. Ambiguous multi-room sessions fail closed.
export async function joinableAudioPresence(db, viewer, target, io = globalThis.portalIo, now = new Date()) {
  if (!io || viewer.id === target.id) return null;
  const eligible = async () => {
    const [follows, blocked, active] = await Promise.all([
      db.userFollow.count({where:{OR:[{followerId:viewer.id,followedId:target.id},{followerId:target.id,followedId:viewer.id}]}}),
      db.userBlock.findFirst({where:{OR:[{blockerId:viewer.id,blockedId:target.id},{blockerId:target.id,blockedId:viewer.id}]}}),
      db.user.findFirst({where:{id:target.id,status:'ACTIVE',deletedAt:null,bans:{none:{target:'USER',revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}},select:{id:true}}),
    ]);
    return follows===2 && !blocked && Boolean(active);
  };
  if (!await eligible()) return null;
  const presence = async () => {
    const rooms = new Map();
    for (const socket of await io.in(`user:${target.publicId}`).fetchSockets()) {
      const until=socket.data?.audioPresenceLeaseUntil;
      if (!Number.isFinite(until)||until<=Date.now()) continue;
      for (const channel of socket.rooms) if (channel.startsWith('audio-room:')) {
        const id=channel.slice('audio-room:'.length);
        rooms.set(id,Math.max(rooms.get(id)||0,until));
      }
    }
    return rooms;
  };
  const rooms=await presence();
  if (rooms.size!==1) return null;
  const [roomId,lease]=[...rooms][0];
  const room=await db.audioRoom.findUnique({where:{roomId}});
  // Do not disclose private/password/paid rooms through profile discovery.
  if (!room||room.status!=='LIVE'||room.isBlocked||room.privacyMode!=='PUBLIC'||room.passwordHash) return null;
  const ownerBlocked=await db.userBlock.findFirst({where:{OR:[{blockerId:viewer.id,blockedId:room.ownerId},{blockerId:room.ownerId,blockedId:viewer.id}]}});
  if (ownerBlocked || (await roomAccessCheck(db,room,viewer.id,now)).code) return null;
  if (!await eligible()) return null;
  const fresh=await presence();
  if(fresh.size!==1||!fresh.has(roomId))return null;
  const expires=Math.min(lease,fresh.get(roomId),now.getTime()+30000);
  return expires>Date.now()?{type:'AUDIO',roomId,expiresAt:new Date(expires).toISOString()}:null;
}
