import { randomUUID } from 'node:crypto';
import { resolveRoomAccess } from './audio-room-management.js';
import { audioRoomSeatIds } from './audio-room-seats.js';

const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status});};
const include={audioRoom:true,requester:{select:{id:true,publicId:true,name:true,profileImage:true}}};
export function seatRequestData(row){
  return {requestId:row.id,roomId:row.audioRoom.roomId,requesterId:row.requester.publicId,
    requesterName:row.requester.name,requesterProfileImage:row.requester.profileImage,
    seatId:row.seatId,status:row.status,accepted:row.status==='APPROVED',note:row.note,
    requestedAt:row.createdAt.toISOString(),expiresAt:row.expiresAt.toISOString(),
    respondedAt:row.respondedAt?.toISOString()??null,actorId:row.actorPublicId,reason:row.reason,
    eventId:`seat-request:${row.id}:${row.status}`};
}
async function transaction(db,work){
  for(let attempt=0;;attempt++)try{return await db.$transaction(work,{isolationLevel:'Serializable'});}
  catch(e){if(!['P2034','P2002'].includes(e.code)||attempt>=3)throw e;}
}
async function roomFor(tx,roomId){
  const room=await tx.audioRoom.findUnique({where:{roomId}});
  if(!room||room.status!=='LIVE'||room.isBlocked)fail('ROOM_UNAVAILABLE',404);
  return room;
}
export async function requireSeatRequestMember(tx,room,userId){
  const [member,user,ban,roomBan,block]=await Promise.all([
    tx.audioRoomMember.findUnique({where:{audioRoomId_userId:{audioRoomId:room.id,userId}}}),
    tx.user.findUnique({where:{id:userId}}),
    tx.ban.findFirst({where:{userId,target:'USER',revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}),
    tx.audioRoomBan.findFirst({where:{audioRoomId:room.id,userId,revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}}),
    tx.userBlock.findFirst({where:{OR:[{blockerId:userId,blockedId:room.ownerId},{blockerId:room.ownerId,blockedId:userId}]}}),
  ]);
  if(!user||user.deletedAt||user.status!=='ACTIVE'||ban||roomBan||block)fail('ROOM_PERMISSION_DENIED',403);
  if(!member||member.socketCount<=0)fail('JOIN_ROOM_FIRST',403);
  if(globalThis.portalIo){
    const sockets=await globalThis.portalIo.in(`user:${user.publicId}`).fetchSockets();
    if(!sockets.some(s=>s.rooms.has(`audio-room:${room.roomId}`)&&s.data.audioPresenceLeaseUntil>Date.now()))fail('JOIN_ROOM_FIRST',403);
  }
  return user;
}
async function moderator(tx,room,userId){
  const actor=await requireSeatRequestMember(tx,room,userId);
  const access=await resolveRoomAccess(room,userId,tx);
  if(!access.permissions.canManageSeats)fail('ROOM_PERMISSION_DENIED',403);
  return {actor,access};
}
export async function createSeatRequest(db,userId,input){
  if(typeof input.roomId!=='string'||(input.seatId!=null&&typeof input.seatId!=='string')||
    (input.note!=null&&(typeof input.note!=='string'||input.note.length>500)))fail('VALIDATION_ERROR',422);
  return transaction(db,async tx=>{
    const room=await roomFor(tx,input.roomId);await requireSeatRequestMember(tx,room,userId);
    if(room.ownerId===userId)fail('VIEWER_REQUIRED');
    const seatId=input.seatId||null;
    if(seatId&&!audioRoomSeatIds(room.seatLayout).includes(seatId))fail('SEAT_NOT_FOUND');
    if(await tx.audioRoomSeat.findFirst({where:{audioRoomId:room.id,occupantUserId:userId}}))fail('ALREADY_SEATED');
    await tx.audioRoomSeatRequest.updateMany({where:{audioRoomId:room.id,requesterId:userId,status:'PENDING',expiresAt:{lte:new Date()}},data:{status:'EXPIRED',respondedAt:new Date()}});
    const prior=await tx.audioRoomSeatRequest.findFirst({where:{audioRoomId:room.id,requesterId:userId,status:'PENDING'},include});
    if(prior){if(prior.seatId!==seatId)fail('SEAT_REQUEST_PENDING');return {row:prior,created:false};}
    const recent=await tx.audioRoomSeatRequest.count({where:{requesterId:userId,createdAt:{gt:new Date(Date.now()-60000)}}});
    if(recent>=5)fail('RATE_LIMITED',429);
    const row=await tx.audioRoomSeatRequest.create({data:{id:randomUUID(),audioRoomId:room.id,requesterId:userId,seatId,note:input.note?.trim()||null,expiresAt:new Date(Date.now()+60000)},include});
    return {row,created:true};
  });
}
export async function respondSeatRequest(db,actorId,input){
  if(typeof input.roomId!=='string'||typeof input.requestId!=='string'||typeof input.accepted!=='boolean'||
    (input.reason!=null&&(typeof input.reason!=='string'||input.reason.length>500)))fail('VALIDATION_ERROR',422);
  return transaction(db,async tx=>{
    const room=await roomFor(tx,input.roomId),{actor,access}=await moderator(tx,room,actorId);
    const row=await tx.audioRoomSeatRequest.findUnique({where:{id:input.requestId},include});
    if(!row||row.audioRoomId!==room.id)fail('SEAT_REQUEST_NOT_FOUND',404);
    if((input.requesterId!=null&&input.requesterId!==row.requester.publicId)||
      (input.seatId!=null&&input.seatId!==row.seatId))fail('SEAT_REQUEST_MISMATCH',422);
    if(row.status!=='PENDING')fail('SEAT_REQUEST_RESOLVED');
    if(row.expiresAt<=new Date())fail('SEAT_REQUEST_EXPIRED');
    const target=await requireSeatRequestMember(tx,room,row.requesterId);
    const targetAccess=await resolveRoomAccess(room,target.id,tx);
    if(target.id===room.ownerId||(access.role!=='OWNER'&&targetAccess.role!=='MEMBER'&&target.id!==actorId))fail('PROTECTED_ROOM_MEMBER',403);
    let seatId=row.seatId;
    if(input.accepted){
      const valid=audioRoomSeatIds(room.seatLayout);
      if(await tx.audioRoomSeat.findFirst({where:{audioRoomId:room.id,occupantUserId:target.id}}))fail('ALREADY_SEATED');
      // Null means any available audience seat, chosen by the server, not the moderator.
      if(!seatId){const seats=await tx.audioRoomSeat.findMany({where:{audioRoomId:room.id,seatId:{in:valid},occupantUserId:null}});seatId=valid.find(id=>seats.some(s=>s.seatId===id));}
      if(!seatId||!valid.includes(seatId))fail('SEAT_NOT_FOUND');
      const claimed=await tx.audioRoomSeat.updateMany({where:{audioRoomId:room.id,seatId,occupantUserId:null},data:{occupantUserId:target.id,occupiedAt:new Date(),isMuted:true,isSpeaking:false}});
      if(!claimed.count)fail('SEAT_OCCUPIED');
      // isLocked and force-mute restrictions are intentionally preserved.
      await tx.audioRoom.update({where:{id:room.id},data:{seatRevision:{increment:1}}});
    }
    const claimed=await tx.audioRoomSeatRequest.updateMany({where:{id:row.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:input.accepted?'APPROVED':'DENIED',seatId,respondedAt:new Date(),actorPublicId:actor.publicId,reason:input.reason?.trim()||null}});
    if(!claimed.count)fail('SEAT_REQUEST_RESOLVED');
    return tx.audioRoomSeatRequest.findUnique({where:{id:row.id},include});
  });
}
export async function listSeatRequests(db,userId,roomId,{cursor,limit=30}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)fail('VALIDATION_ERROR',422);
  const room=await roomFor(db,roomId);await moderator(db,room,userId);
  const where={audioRoomId:room.id,status:'PENDING',expiresAt:{gt:new Date()}};
  if(cursor){const anchor=await db.audioRoomSeatRequest.findUnique({where:{id:cursor}});if(!anchor||anchor.audioRoomId!==room.id)fail('VALIDATION_ERROR',422);where.OR=[{createdAt:{gt:anchor.createdAt}},{createdAt:anchor.createdAt,id:{gt:anchor.id}}];}
  const rows=await db.audioRoomSeatRequest.findMany({where,include,orderBy:[{createdAt:'asc'},{id:'asc'}],take:limit+1});
  return {roomId,items:rows.slice(0,limit).map(seatRequestData),nextCursor:rows.length>limit?rows[limit-1].id:null,serverTime:new Date().toISOString()};
}
export async function cancelSeatRequests(db,where){
  return db.audioRoomSeatRequest.updateMany({where:{...where,status:'PENDING'},data:{status:'CANCELLED',respondedAt:new Date()}});
}
export async function sweepSeatRequests(db){
  const now=new Date();
  await db.audioRoomSeatRequest.updateMany({where:{status:'PENDING',expiresAt:{lte:now}},data:{status:'EXPIRED',respondedAt:now}});
  // Leave/switch is cancelled immediately by the socket lifecycle. This also
  // recovers closed rooms after restart without deleting history.
  await cancelSeatRequests(db,{OR:[{audioRoom:{status:{not:'LIVE'}}},{audioRoom:{isBlocked:true}}]});
}
export async function emitSeatRequest(db,io,row,event,privateData={}){
  const sockets=await io.in(`audio-room:${row.audioRoom.roomId}`).fetchSockets();
  const recipients=new Set();
  for(const socket of sockets){
    if(socket.data.audioPresenceLeaseUntil!=null&&socket.data.audioPresenceLeaseUntil<=Date.now())continue;
    const publicId=socket.data.userId;if(!publicId||recipients.has(publicId))continue;
    const user=await db.user.findUnique({where:{publicId},select:{id:true}});if(!user)continue;
    try{await moderator(db,row.audioRoom,user.id);recipients.add(publicId);}catch{/* Permission may have been revoked. */}
  }
  if(event==='audio-room:seat-response'){
    recipients.delete(row.requester.publicId);
    io.to(`user:${row.requester.publicId}`).emit(event,{success:true,data:{...seatRequestData(row),...privateData}});
  }
  if(recipients.size)io.to([...recipients].map(id=>`user:${id}`)).emit(event,{success:true,data:seatRequestData(row)});
}
export async function deliverSeatResolutions(db,io,onApproved=async()=>({})){
  const rows=await db.audioRoomSeatRequest.findMany({where:{status:{not:'PENDING'},notifiedAt:null},include,orderBy:{respondedAt:'asc'},take:100});
  for(const row of rows){
    // One notifier wins; reconnect recovers the authoritative pending list if a
    // process stops after claiming a notification.
    const claim=await db.audioRoomSeatRequest.updateMany({where:{id:row.id,notifiedAt:null},data:{notifiedAt:new Date()}});
    if(claim.count)try{
      let privateData={};
      if(row.status==='APPROVED')try{privateData=await onApproved(row);}catch{
        privateData={rtcRefreshRequired:true};
        io.to(`user:${row.requester.publicId}`).emit('rtc:credentials-invalidated',{success:true,data:{roomId:row.audioRoom.roomId,reconnect:false}});
      }
      await emitSeatRequest(db,io,row,'audio-room:seat-response',privateData);
    }catch(e){await db.audioRoomSeatRequest.update({where:{id:row.id},data:{notifiedAt:null}});throw e;}
  }
}
