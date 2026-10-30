import { hasVipPrivilege } from "./vip-capabilities.js";
export async function emitVipRoomPresence(db, io, room, user, event, data) {
  if (!await hasVipPrivilege(user.id, "INVISIBLE_ENTRY", db)) {
    io.to(`audio-room:${room.roomId}`).emit(event, {success:true,data}); return;
  }
  const roles = await db.audioRoomRole.findMany({where:{audioRoomId:room.id},select:{userId:true}});
  const moderators = await db.user.findMany({where:{id:{in:[room.ownerId,...roles.map(r=>r.userId)]}},select:{publicId:true}});
  for (const moderator of moderators) io.to(`user:${moderator.publicId}`).emit(event,{success:true,data:{...data,silent:true}});
}
