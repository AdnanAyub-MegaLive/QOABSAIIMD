import { reconcileExpiredSpecialIds, activeSpecialIds } from '../special-id.js';
import { reconcileExpiredAudioRoomRestrictions } from '../audio-room-maintenance.js';
export async function sweepExpiries(db, io, now = new Date()) {
  const bans = await db.ban.findMany({where:{revokedAt:null,expiresAt:{lte:now}},select:{id:true,userId:true,talentId:true,deviceId:true},take:500});
  if(bans.length) {
    await db.ban.updateMany({where:{id:{in:bans.map(b=>b.id)},revokedAt:null,expiresAt:{lte:now}},data:{revokedAt:now}});
    for(const userId of new Set(bans.map(b=>b.userId).filter(Boolean))) {
      if(await db.ban.count({where:{userId,target:'USER',revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}))continue;
      const changed=await db.user.updateMany({where:{id:userId,status:'BANNED',deletedAt:null},data:{status:'ACTIVE'}});
      if(changed.count) {const user=await db.user.findUnique({where:{id:userId},select:{publicId:true,sessionVersion:true,forcedLogoutAt:true}});
        io.to(`user:${user.publicId}`).emit('account:unbanned',{success:true,data:{sessionVersion:user.sessionVersion,forcedLogoutAt:user.forcedLogoutAt?.toISOString()??null,isBanned:false,banReason:null,banExpiresAt:null}});}
    }
    for(const talentId of new Set(bans.map(b=>b.talentId).filter(Boolean)))if(!await db.ban.count({where:{talentId,target:'USER',revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}))await db.talent.updateMany({where:{id:talentId,status:'BANNED'},data:{status:'ACTIVE'}});
    for(const deviceId of new Set(bans.map(b=>b.deviceId).filter(Boolean)))if(!await db.ban.count({where:{deviceId,target:'DEVICE',revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}))await db.device.updateMany({where:{id:deviceId},data:{isBanned:false}});
  }
  const expiredIdentities=await db.specialIdAssignment.findMany({where:{status:'ACTIVE',revokedAt:null,expiresAt:{lte:now}},include:{user:{select:{publicId:true}}},take:200});
  await reconcileExpiredSpecialIds(db);
  const effective=await activeSpecialIds(expiredIdentities.map(item=>item.userId),db);
  for(const assignment of expiredIdentities){
    const current=await db.specialIdAssignment.findUnique({where:{id:assignment.id},select:{status:true}});
    if(current?.status!=='EXPIRED')continue;
    const specialId=effective.get(assignment.userId)??null;
    const identity={normalId:assignment.user.publicId,effectiveId:specialId??assignment.user.publicId,specialId};
    await db.auditLog.create({data:{action:'SPECIAL_ID_EXPIRED',category:'USER_MANAGEMENT',entityType:'User',entityId:assignment.user.publicId,description:'Special ID expired; the next available identity was selected.',metadata:{source:'DATABASE_SWEEPER',specialId:assignment.specialId,effectiveId:identity.effectiveId,expiredAt:now.toISOString()}}});
    io.to(`user:${assignment.user.publicId}`).emit('special-id:expired',{success:true,data:{...identity,expiredSpecialId:assignment.specialId,expiredAt:now.toISOString()}});
  }
  const rooms=await db.audioRoom.findMany({where:{OR:[{joiningDisabled:true,joiningDisabledUntil:{lte:now}},{isBlocked:true,blockedUntil:{lte:now}},{status:'TERMINATED',terminatedUntil:{lte:now}}]},include:{owner:{select:{publicId:true}}},take:250});
  for(const room of rooms) {
    const result=await reconcileExpiredAudioRoomRestrictions(room.roomId);
    const updated=await db.audioRoom.findUnique({where:{id:room.id},select:{revision:true}});
    for(const [changed,event,action] of [[result.joiningEnabled,'audio-room:joining-enabled','ENABLE_JOINING'],[result.unblocked,'audio-room:unblocked','UNBLOCK'],[result.restored,'audio-room:restored','RESTORE']])if(changed){
      const payload={success:true,data:{roomId:room.roomId,action,revision:updated.revision,reason:'Scheduled restriction expired',expiredAt:now.toISOString()}};
      io.to(`audio-room:${room.roomId}`).to(`user:${room.owner.publicId}`).emit(event,payload);
      await db.auditLog.create({data:{action:`AUDIO_ROOM_${action}`,category:'USER_MANAGEMENT',entityType:'AudioRoom',entityId:room.roomId,description:`Scheduled restriction expired for audio room ${room.roomId}.`,metadata:{source:'DATABASE_SWEEPER'}}});
    }
  }
  const invitations=await db.audioRoomSeatInvitation.findMany({where:{status:'PENDING',expiresAt:{lte:now}},include:{target:{select:{publicId:true}}},take:500});
  for(const invite of invitations){const changed=await db.audioRoomSeatInvitation.updateMany({where:{id:invite.id,status:'PENDING',expiresAt:{lte:now}},data:{status:'EXPIRED',respondedAt:now}});if(changed.count)io.to(`user:${invite.target.publicId}`).emit('audio-room:seat-invitation-expired',{success:true,data:{invitationId:invite.id}});}
}
