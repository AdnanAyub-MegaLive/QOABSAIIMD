// Serialize the read/repair/write sequence for a room across all workers. Read
// current cross-process sockets AFTER taking the lock, so a delayed disconnect
// cannot overwrite a more recent join. Grace entries represent disconnected users.
export async function syncAudioPresence(db, io, room, shared, now = new Date()) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`audio-presence:${room.id}`},0))::text`;
    const sockets = await io.in(`audio-room:${room.roomId}`).fetchSockets();
    const counts = new Map();
    for(const socket of sockets)if(socket.data.userId)counts.set(socket.data.userId,(counts.get(socket.data.userId)??0)+1);
    for(const publicId of await shared.graceUsers(room.roomId))if(!counts.has(publicId))counts.set(publicId,1);
    const users=counts.size?await tx.user.findMany({where:{publicId:{in:[...counts.keys()]},deletedAt:null},select:{id:true,publicId:true}}):[];
    const previous=await tx.audioRoomMember.findMany({where:{audioRoomId:room.id,socketCount:{gt:0}},select:{userId:true,socketCount:true}});
    const before=new Map(previous.map(item=>[item.userId,item.socketCount]));
    const desired=new Map(users.map(user=>[user.id,counts.get(user.publicId)]));
    const freed=await tx.audioRoomSeat.updateMany({where:{audioRoomId:room.id,occupantUserId:{not:null,notIn:[...desired.keys()]}},data:{occupantUserId:null,occupiedAt:null,isMuted:true,isForceMuted:false,forceMutedUntil:null,isSpeaking:false}});
    const changed=freed.count>0||previous.length!==desired.size||previous.some(item=>item.socketCount!==desired.get(item.userId));
    // One transaction for members and aggregate count; no lost read-modify-write.
    await tx.audioRoomMember.updateMany({where:{audioRoomId:room.id,socketCount:{gt:0},userId:{notIn:[...desired.keys()]}},data:{socketCount:0,lastSeenAt:now}});
    for(const[userId,socketCount]of desired)await tx.audioRoomMember.upsert({where:{audioRoomId_userId:{audioRoomId:room.id,userId}},create:{audioRoomId:room.id,userId,socketCount,lastSeenAt:now},update:{socketCount,lastSeenAt:now}});
    const updated=await tx.audioRoom.update({where:{id:room.id},data:{participantCount:desired.size,...(changed?{revision:{increment:1}}:{})},select:{revision:true}});
    await tx.$executeRaw`SELECT refresh_audio_mic_attendance(${room.id}, ${[...desired.keys()]}::text[], ${now}::timestamp)`;
    return {total:desired.size,revision:updated.revision,before,desired,changed,freedSeats:freed.count};
  },{timeout:15000,maxWait:5000});
}
export async function syncVideoPresence(db,io,live,now=new Date()) {
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`video-presence:${live.id}`},0))::text`;
    const sockets=await io.in(`live-video:${live.publicId}`).fetchSockets();
    const counts=new Map();for(const socket of sockets)if(socket.data.internalUserId)counts.set(socket.data.internalUserId,(counts.get(socket.data.internalUserId)??0)+1);
    await tx.videoLiveViewer.updateMany({where:{sessionId:live.id,userId:{notIn:[...counts.keys()]}},data:{socketCount:0,active:false}});
    for(const[userId,socketCount]of counts)await tx.videoLiveViewer.upsert({where:{sessionId_userId:{sessionId:live.id,userId}},create:{sessionId:live.id,userId,socketCount,active:true,lastSeenAt:now},update:{socketCount,active:true,lastSeenAt:now}});
    const current=await tx.videoLiveSession.findUnique({where:{id:live.id},select:{peakViewers:true}});
    return tx.videoLiveSession.update({where:{id:live.id},data:{viewerCount:counts.size,peakViewers:Math.max(current.peakViewers,counts.size),revision:{increment:1}},select:{revision:true,viewerCount:true}});
  },{timeout:15000,maxWait:5000});
}
export async function releaseSharedAudioRoom(db,io,room,shared) {
  const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`audio-presence:${room.id}`},0))::text`;
    if((await io.in(`audio-room:${room.roomId}`).fetchSockets()).length||(await shared.graceUsers(room.roomId)).length)return null;
    const endedAt=new Date();
    const changed=await tx.audioRoom.updateMany({where:{id:room.id,status:'LIVE'},data:{status:'IDLE',participantCount:0,liveAudioUrl:null,endedAt,revision:{increment:1}}});
    if(!changed.count)return null;
    await tx.audioRoomMember.updateMany({where:{audioRoomId:room.id},data:{socketCount:0,lastSeenAt:endedAt,isDeafened:false,deafenedUntil:null}});
    await tx.audioRoomSeat.updateMany({where:{audioRoomId:room.id},data:{occupantUserId:null,occupiedAt:null,isMuted:true,isForceMuted:false,forceMutedUntil:null,isSpeaking:false}});
    await tx.auditLog.create({data:{action:'AUDIO_ROOM_AUTO_RELEASED',category:'USER_MANAGEMENT',entityType:'AudioRoom',entityId:room.roomId,description:'Empty room released after cross-process presence and reconnect grace checks.',metadata:{source:'SHARED_PRESENCE',persistentRoomId:true}}});
    return endedAt;
  },{timeout:15000,maxWait:5000});
  if(result)io.to(`user:${room.owner.publicId}`).emit('audio-room:idle',{success:true,data:{roomId:room.roomId,status:'IDLE',endedAt:result.toISOString(),roomIdRetained:true}});
  return Boolean(result);
}
