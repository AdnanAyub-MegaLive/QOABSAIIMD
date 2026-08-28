const { createServer } = require("node:http");
const { randomUUID } = require("node:crypto");
const next = require("next");
const { Server } = require("socket.io");
const { loadEnvConfig } = require("@next/env");
const { verifyMobileSessionToken } = require("./src/lib/mobile-session.cjs");

loadEnvConfig(process.cwd());
const dev=process.argv.includes("--dev");
const hostname=process.env.HOSTNAME||"0.0.0.0";
const port=Number(process.env.PORT||3000);
const app=next({dev,hostname,port});
const handle=app.getRequestHandler();

app.prepare().then(async()=>{
  const {prisma}=await import("./src/lib/prisma.js");
  const {reconcileExpiredAudioRoomRestrictions}=await import("./src/lib/audio-room-maintenance.js");
  const {createMessage,ensureWorldConversation,requireConversationParticipant}=await import("./src/lib/messaging.js");
  const {resolveUserPerks,socketOrigin}=await import("./src/lib/user-perks.js");
  const {formatDateOnly}=await import("./src/lib/date-only.js");
  const {getEffectiveUserId}=await import("./src/lib/special-id.js");
  const {issueTrtcAccess}=await import("./src/lib/trtc-authorization.js");
  const {ensureAudioRoomSeats,leaveAudioRoomSeat,moveAudioRoomSeat,readAudioRoomSeatState,seatErrorPayload,takeAudioRoomSeat}=await import("./src/lib/audio-room-seats.js");
  const httpServer=createServer((request,response)=>handle(request,response));
  const io=new Server(httpServer,{cors:{origin:process.env.MOBILE_APP_ORIGIN||"*",methods:["GET","POST"]}});
  globalThis.portalIo=io;
  globalThis.portalDisconnectUser=(publicId)=>setTimeout(()=>io.in(`user:${publicId}`).disconnectSockets(true),100);
  globalThis.portalSendNotification=async({userId=null,title,body})=>{
    const target=userId?await prisma.user.findUnique({where:{publicId:userId},select:{id:true,publicId:true}}):null;
    if(userId&&!target)throw new Error("USER_NOT_FOUND");
    const notification=await prisma.notification.create({data:{
      publicId:`NOT-${randomUUID().replaceAll("-","").slice(0,16).toUpperCase()}`,
      userId:target?.id??null,
      title:String(title??"").trim().slice(0,120),
      body:String(body??"").trim().slice(0,2000),
    }});
    const payload={id:notification.publicId,title:notification.title,body:notification.body,createdAt:notification.createdAt.toISOString()};
    if(target)io.to(`user:${target.publicId}`).emit("notification:new",payload);
    else io.emit("notification:new",payload);
    return payload;
  };
  const scheduleBanExpiry=(publicId,expiresAt)=>{
    if(!expiresAt)return;
    const remaining=new Date(expiresAt).getTime()-Date.now();
    if(remaining>2147483647)return setTimeout(()=>scheduleBanExpiry(publicId,expiresAt),2147483647);
    setTimeout(async()=>{
      const user=await prisma.user.findUnique({where:{publicId}});
      if(!user)return;
      const now=new Date();
      await prisma.ban.updateMany({where:{userId:user.id,target:"USER",revokedAt:null,expiresAt:{lte:now}},data:{revokedAt:now}});
      const activeBan=await prisma.ban.findFirst({where:{userId:user.id,target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]},orderBy:{createdAt:"desc"}});
      if(!activeBan){
        await prisma.user.update({where:{id:user.id},data:{status:"ACTIVE"}});
        io.to(`user:${publicId}`).emit("account:unbanned",{success:true,data:{sessionVersion:user.sessionVersion,forcedLogoutAt:user.forcedLogoutAt?.toISOString()??null,isBanned:false,banReason:null,banExpiresAt:null}});
      }
    },Math.max(remaining,0));
  };
  globalThis.portalScheduleBanExpiry=scheduleBanExpiry;
  const timedBans=await prisma.ban.findMany({where:{target:"USER",userId:{not:null},revokedAt:null,expiresAt:{gt:new Date()}},include:{user:{select:{publicId:true}}}});
  for(const ban of timedBans)scheduleBanExpiry(ban.user.publicId,ban.expiresAt);

  const scheduleSpecialIdExpiry=(assignmentId,expiresAt)=>{
    if(!expiresAt)return;
    const remaining=new Date(expiresAt).getTime()-Date.now();
    if(remaining>2147483647)return setTimeout(()=>scheduleSpecialIdExpiry(assignmentId,expiresAt),2147483647);
    setTimeout(async()=>{
      try{
        const assignment=await prisma.specialIdAssignment.findUnique({where:{id:assignmentId},include:{user:{select:{publicId:true}}}});
        if(!assignment||assignment.status!=="ACTIVE"||assignment.revokedAt)return;
        const now=new Date();
        if(assignment.expiresAt&&assignment.expiresAt>now)return scheduleSpecialIdExpiry(assignment.id,assignment.expiresAt);
        const expired=await prisma.specialIdAssignment.updateMany({where:{id:assignment.id,status:"ACTIVE",revokedAt:null,expiresAt:{lte:now}},data:{status:"EXPIRED"}});
        if(!expired.count)return;
        await prisma.auditLog.create({data:{action:"SPECIAL_ID_EXPIRED",category:"USER_MANAGEMENT",entityType:"User",entityId:assignment.user.publicId,description:`Special ID ${assignment.specialId} expired for user ${assignment.user.publicId}; the normal ID was restored.`,metadata:{source:"SYSTEM_TIMER",specialId:assignment.specialId,expiredAt:now.toISOString()}}});
        io.to(`user:${assignment.user.publicId}`).emit("special-id:expired",{success:true,data:{normalId:assignment.user.publicId,effectiveId:assignment.user.publicId,specialId:null,expiredSpecialId:assignment.specialId,expiredAt:now.toISOString()}});
      }catch(error){console.error("Special ID expiry failed",error);}
    },Math.max(remaining,0));
  };
  globalThis.portalScheduleSpecialIdExpiry=scheduleSpecialIdExpiry;
  const now=new Date();
  await prisma.specialIdAssignment.updateMany({where:{status:"ACTIVE",expiresAt:{lte:now}},data:{status:"EXPIRED"}});
  const timedSpecialIds=await prisma.specialIdAssignment.findMany({where:{status:"ACTIVE",revokedAt:null,expiresAt:{gt:now}},select:{id:true,expiresAt:true}});
  for(const assignment of timedSpecialIds)scheduleSpecialIdExpiry(assignment.id,assignment.expiresAt);

  const scheduleAudioRoomRestriction=(roomId,action,expiresAt)=>{
    if(!expiresAt)return;
    const remaining=new Date(expiresAt).getTime()-Date.now();
    if(remaining>2147483647)return setTimeout(()=>scheduleAudioRoomRestriction(roomId,action,expiresAt),2147483647);
    setTimeout(async()=>{
      try{
        const result=await reconcileExpiredAudioRoomRestrictions(roomId);
        const room=await prisma.audioRoom.findUnique({where:{roomId},include:{owner:{select:{publicId:true}}}});
        if(!room)return;
        const definitions={DISABLE_JOINING:[result.joiningEnabled,"audio-room:joining-enabled","ENABLE_JOINING"],BLOCK:[result.unblocked,"audio-room:unblocked","UNBLOCK"],TERMINATE:[result.restored,"audio-room:restored","RESTORE"]};
        const [changed,event,resolvedAction]=definitions[action]??[];
        if(!changed)return;
        const payload={success:true,data:{roomId,action:resolvedAction,reason:"Scheduled restriction expired",expiredAt:new Date().toISOString()}};
        io.to(`audio-room:${roomId}`).emit(event,payload);
        io.to(`user:${room.owner.publicId}`).emit(event,payload);
        await prisma.auditLog.create({data:{action:`AUDIO_ROOM_${resolvedAction}`,category:"USER_MANAGEMENT",entityType:"AudioRoom",entityId:roomId,description:`Timed ${action.toLowerCase().replaceAll("_"," ")} expired for audio room ${roomId}.`,metadata:{source:"SYSTEM_TIMER",ownerId:room.owner.publicId}}});
      }catch(error){console.error("Audio room restriction expiry failed",error);}
    },Math.max(remaining,0));
  };
  globalThis.portalScheduleAudioRoomRestriction=scheduleAudioRoomRestriction;
  await reconcileExpiredAudioRoomRestrictions();
  const restrictedRooms=await prisma.audioRoom.findMany({where:{OR:[{joiningDisabled:true,joiningDisabledUntil:{gt:new Date()}},{isBlocked:true,blockedUntil:{gt:new Date()}},{status:"TERMINATED",terminatedUntil:{gt:new Date()}}]},select:{roomId:true,joiningDisabledUntil:true,blockedUntil:true,terminatedUntil:true}});
  for(const room of restrictedRooms){
    if(room.joiningDisabledUntil)scheduleAudioRoomRestriction(room.roomId,"DISABLE_JOINING",room.joiningDisabledUntil);
    if(room.blockedUntil)scheduleAudioRoomRestriction(room.roomId,"BLOCK",room.blockedUntil);
    if(room.terminatedUntil)scheduleAudioRoomRestriction(room.roomId,"TERMINATE",room.terminatedUntil);
  }

  const releaseEmptyAudioRoom=async(roomId)=>{
    const socketRoom=`audio-room:${roomId}`;
    if((io.sockets.adapter.rooms.get(socketRoom)?.size??0)>0)return false;
    const room=await prisma.audioRoom.findUnique({where:{roomId},include:{owner:{select:{publicId:true}}}});
    if(!room||room.status!=="LIVE")return false;
    const endedAt=new Date();
    await prisma.audioRoom.update({where:{id:room.id},data:{status:"IDLE",participantCount:0,liveAudioUrl:null,endedAt}});
    await prisma.audioRoomSeat.updateMany({where:{audioRoomId:room.id},data:{occupantUserId:null,occupiedAt:null,isMuted:true,isSpeaking:false}});
    await prisma.auditLog.create({data:{action:"AUDIO_ROOM_AUTO_RELEASED",category:"USER_MANAGEMENT",entityType:"AudioRoom",entityId:roomId,description:`Audio room ${roomId} became empty; live resources were released and its persistent ID was retained.`,metadata:{source:"SOCKET_IO",ownerId:room.owner.publicId,persistentRoomId:true}}});
    io.to(`user:${room.owner.publicId}`).emit("audio-room:idle",{success:true,data:{roomId,status:"IDLE",endedAt:endedAt.toISOString(),roomIdRetained:true}});
    return true;
  };
  const broadcastAudioRoomSeatState=async(room,origin,participantCount)=>{
    const seatState=await readAudioRoomSeatState(room,origin);
    io.to(`audio-room:${room.roomId}`).emit("audio-room:seat-update",{
      success:true,
      data:{...seatState,...(typeof participantCount==="number"?{participantCount}:{})},
    });
    return seatState;
  };

  io.use(async(socket,nextSocket)=>{
    try{
      const payload=verifyMobileSessionToken(socket.handshake.auth?.token);
      const user=await prisma.user.findUnique({where:{publicId:payload.userId}});
      if(!user||user.deletedAt||user.sessionVersion!==payload.sessionVersion)return nextSocket(new Error("SESSION_REVOKED"));
      const ban=await prisma.ban.findFirst({where:{userId:user.id,target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]}});
      if(ban){const error=new Error("ACCOUNT_BANNED");error.data={banReason:ban.reason,banExpiresAt:ban.expiresAt?.toISOString()??null};return nextSocket(error);}
      socket.data.userId=user.publicId;
      nextSocket();
    }catch(error){nextSocket(new Error(error.message||"UNAUTHORIZED"));}
  });

  io.on("connection",async(socket)=>{
    const userId=socket.data.userId;
    socket.join(`user:${userId}`);
    const user=await prisma.user.findUnique({where:{publicId:userId}});
    const connectionOrigin=socketOrigin(socket);
    await ensureWorldConversation(user.id);
    const conversationMemberships=await prisma.conversationParticipant.findMany({
      where:{userId:user.id},
      select:{conversation:{select:{publicId:true}}},
    });
    for(const membership of conversationMemberships)socket.join(`conversation:${membership.conversation.publicId}`);
    const ban=await prisma.ban.findFirst({where:{userId:user.id,target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},orderBy:{createdAt:"desc"}});
    socket.emit("session:status",{success:true,data:{sessionVersion:user.sessionVersion,forcedLogoutAt:user.forcedLogoutAt?.toISOString()??null,isVerified:Boolean(user.isVerified),isOfficial:Boolean(user.isOfficial),isBanned:Boolean(ban),banReason:ban?.reason??null,banExpiresAt:ban?.expiresAt?.toISOString()??null}});
    socket.on("message:send",async({conversationId,body}={},ack=()=>{})=>{
      try{
        const id=String(conversationId??"");
        const membership=await requireConversationParticipant(id,user.id);
        socket.join(`conversation:${id}`);
        const senderPerks=(await resolveUserPerks([user],connectionOrigin,["FRAMES","BADGES","CHAT_BOXES"])).get(user.publicId);
        const message=await createMessage(membership.conversation,user,body,senderPerks);
        const eventPayload={conversationId:id,message};
        const recipients=await prisma.conversationParticipant.findMany({where:{conversationId:membership.conversationId},select:{user:{select:{publicId:true}}}});
        let delivery=io.to(`conversation:${id}`);
        for(const recipient of recipients)delivery=delivery.to(`user:${recipient.user.publicId}`);
        delivery.emit("message:new",eventPayload);
        ack({success:true,data:eventPayload});
      }catch(error){
        const code=error?.code??error?.message;
        ack({success:false,error:{
          code:["CONVERSATION_NOT_FOUND","VALIDATION_ERROR"].includes(code)?code:"MESSAGE_SEND_FAILED",
          message:error?.validationMessage??(code==="CONVERSATION_NOT_FOUND"?"Conversation not found.":"Unable to send this message."),
        }});
      }
    });
    socket.on("audio-room:join",async({roomId}={},ack=()=>{})=>{
      const requestedRoomId=String(roomId??"");
      await reconcileExpiredAudioRoomRestrictions(requestedRoomId);
      const room=await prisma.audioRoom.findUnique({where:{roomId:requestedRoomId},include:{owner:{select:{id:true,publicId:true,name:true,profileImage:true,gender:true,dob:true,isVerified:true,isOfficial:true}}}});
      if(!room)return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
      if(room.isBlocked)return ack({success:false,error:{code:"ROOM_BLOCKED",details:{reason:room.blockedReason,expiresAt:room.blockedUntil?.toISOString()??null}}});
      if(room.status==="TERMINATED")return ack({success:false,error:{code:"ROOM_TERMINATED",details:{expiresAt:room.terminatedUntil?.toISOString()??null}}});
      if(room.status!=="LIVE"&&room.status!=="IDLE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
      if(room.joiningDisabled&&room.ownerId!==user.id)return ack({success:false,error:{code:"ROOM_OWNER_ONLY",details:{expiresAt:room.joiningDisabledUntil?.toISOString()??null}}});
      const roomChannel=`audio-room:${room.roomId}`;
      const alreadyJoined=socket.rooms.has(roomChannel);
      socket.join(roomChannel);
      const participantCount=io.sockets.adapter.rooms.get(roomChannel)?.size??1;
      await prisma.audioRoom.update({where:{id:room.id},data:{participantCount,status:"LIVE",endedAt:null}});
      const isOwner=room.ownerId===user.id;
      const joinedUserPerks=await resolveUserPerks([room.owner,user],connectionOrigin,["FRAMES","BADGES","ROOM_BACKGROUNDS","ENTRANCES","TAIL_LIGHTS","RIDES"]);
      const roomPerks=joinedUserPerks.get(room.owner.publicId);
      const joiningPerks=joinedUserPerks.get(user.publicId);
      const seatState=await readAudioRoomSeatState(room,connectionOrigin);
      const ownerIdentity=await getEffectiveUserId(room.owner.id,room.owner.publicId);
      ack({success:true,data:{roomId:room.roomId,title:room.title,participantCount,ownerId:room.owner.publicId,isOwner,seatState,roomBackgroundUrl:roomPerks?.roomBackgroundUrl??null,owner:{publicId:room.owner.publicId,displayId:ownerIdentity.effectiveId,specialId:ownerIdentity.specialId,name:room.owner.name,profileImage:room.owner.profileImage,gender:room.owner.gender??null,dob:formatDateOnly(room.owner.dob),isVerified:Boolean(room.owner.isVerified),isOfficial:Boolean(room.owner.isOfficial),frameUrl:roomPerks?.frameUrl??null,badgeUrl:roomPerks?.badgeUrl??null}}});
      if(!alreadyJoined){
        io.to(roomChannel).emit("audio-room:entrance",{
          success:true,
          data:{
            roomId:room.roomId,
            userId,
            name:user.name,
            profileImage:user.profileImage??null,
            gender:user.gender??null,
            isVerified:Boolean(user.isVerified),
            isOfficial:Boolean(user.isOfficial),
            dob:formatDateOnly(user.dob),
            entranceUrl:joiningPerks?.entranceUrl??null,
            rideUrl:joiningPerks?.rideUrl??null,
          },
        });
        if(!isOwner){
          io.to(`user:${room.owner.publicId}`).emit("audio-room:seat-sync-request",{success:true,data:{roomId:room.roomId,requesterId:userId,requesterName:user.name,requesterProfileImage:user.profileImage??null,requesterGender:user.gender??null,requesterDob:formatDateOnly(user.dob),requesterIsVerified:Boolean(user.isVerified),requesterIsOfficial:Boolean(user.isOfficial),requesterFrameUrl:joiningPerks?.frameUrl??null,requesterBadgeUrl:joiningPerks?.badgeUrl??null,reason:"VIEWER_JOINED"}});
        }
      }
    });
    socket.on("audio-room:message",async({roomId,body}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const text=typeof body==="string"?body.trim():"";
        if(!text||text.length>200)return ack({success:false,error:{code:"VALIDATION_ERROR",message:"Messages must be between 1 and 200 characters."}});
        const room=await prisma.audioRoom.findUnique({where:{roomId:id},select:{id:true,roomId:true,title:true,status:true,isBlocked:true}});
        if(!room||room.status!=="LIVE"||room.isBlocked)return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(!socket.rooms.has(`audio-room:${id}`))return ack({success:false,error:{code:"JOIN_ROOM_FIRST"}});
        const senderPerks=(await resolveUserPerks([user],connectionOrigin,["BADGES","CHAT_BOXES"])).get(user.publicId);
        const messageId=`ARM-${randomUUID().replaceAll("-","").slice(0,16).toUpperCase()}`;
        const storedMessage=await prisma.audioRoomMessage.create({
          data:{
            publicId:messageId,
            audioRoomId:room.id,
            roomPublicId:room.roomId,
            roomTitle:room.title,
            senderId:user.id,
            senderPublicId:user.publicId,
            senderName:user.name,
            body:text,
          },
          select:{createdAt:true},
        });
        const data={
          id:messageId,
          roomId:id,
          body:text,
          createdAt:storedMessage.createdAt.toISOString(),
          sender:{
            publicId:user.publicId,
            name:user.name,
            profileImage:user.profileImage??null,
            badgeUrl:senderPerks?.badgeUrl??null,
            chatBoxUrl:senderPerks?.chatBoxUrl??null,
          },
        };
        io.to(`audio-room:${id}`).emit("audio-room:message",{success:true,data});
        ack({success:true,data});
      }catch(error){
        console.error("Audio room message failed",error);
        ack({success:false,error:{code:"MESSAGE_SEND_FAILED",message:"Unable to send this message."}});
      }
    });
    socket.on("audio-room:seat-update",async({roomId,seatRows,notes}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id}});
        if(!room||room.status!=="LIVE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(!socket.rooms.has(`audio-room:${id}`))return ack({success:false,error:{code:"JOIN_ROOM_FIRST"}});
        const data=await readAudioRoomSeatState(room,connectionOrigin);
        ack({success:true,data:{...data,authoritative:true,ignoredClientSnapshot:Boolean(seatRows||notes)}});
      }catch(error){
        console.error("Audio room seat update failed",error);
        ack({success:false,error:{code:"SEAT_UPDATE_FAILED"}});
      }
    });
    socket.on("audio-room:seat-take",async({roomId,seatId}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const requestedSeatId=String(seatId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id}});
        if(!room||room.status!=="LIVE"||room.isBlocked)return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(!socket.rooms.has(`audio-room:${id}`))return ack({success:false,error:{code:"JOIN_ROOM_FIRST"}});
        const trtc=issueTrtcAccess(user,id,true);
        const seat=await takeAudioRoomSeat(room,user.id,requestedSeatId);
        const seatState=await broadcastAudioRoomSeatState(room,connectionOrigin);
        ack({success:true,data:{seatId:seat.seatId,seatState,trtc}});
      }catch(error){
        console.error("Audio room seat take failed",error);
        ack({success:false,error:error?.message==="TRTC_NOT_CONFIGURED"?{code:"TRTC_NOT_CONFIGURED",message:"Live audio is not configured on this server."}:seatErrorPayload(error)});
      }
    });
    socket.on("audio-room:seat-move",async({roomId,fromSeatId,toSeatId}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id}});
        if(!room||room.status!=="LIVE"||room.isBlocked)return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(!socket.rooms.has(`audio-room:${id}`))return ack({success:false,error:{code:"JOIN_ROOM_FIRST"}});
        const seat=await moveAudioRoomSeat(room,user.id,String(fromSeatId??""),String(toSeatId??""));
        const seatState=await broadcastAudioRoomSeatState(room,connectionOrigin);
        ack({success:true,data:{fromSeatId:String(fromSeatId??""),seatId:seat.seatId,seatState}});
      }catch(error){
        console.error("Audio room seat move failed",error);
        ack({success:false,error:seatErrorPayload(error)});
      }
    });
    socket.on("audio-room:seat-status",async({roomId,muted,speaking}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id}});
        if(!room||room.status!=="LIVE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(!socket.rooms.has(`audio-room:${id}`))return ack({success:false,error:{code:"JOIN_ROOM_FIRST"}});
        const result=await prisma.audioRoomSeat.updateMany({where:{audioRoomId:room.id,occupantUserId:user.id},data:{isMuted:Boolean(muted),isSpeaking:Boolean(speaking)&&!Boolean(muted)}});
        if(!result.count)return ack({success:false,error:{code:"SPEAKER_NOT_SEATED"}});
        const seatState=await broadcastAudioRoomSeatState(room,connectionOrigin);
        ack({success:true,data:{seatState}});
      }catch(error){
        console.error("Audio room seat status failed",error);
        ack({success:false,error:{code:"SEAT_STATUS_FAILED"}});
      }
    });
    socket.on("audio-room:seat-lock",async({roomId,seatId,locked,note}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id}});
        if(!room||room.status!=="LIVE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(room.ownerId!==user.id)return ack({success:false,error:{code:"OWNER_REQUIRED"}});
        await ensureAudioRoomSeats(room.id);
        const result=await prisma.audioRoomSeat.updateMany({where:{audioRoomId:room.id,seatId:String(seatId??"")},data:{isLocked:Boolean(locked),note:typeof note==="string"?note.slice(0,200):undefined}});
        if(!result.count)return ack({success:false,error:{code:"SEAT_NOT_FOUND"}});
        const seatState=await broadcastAudioRoomSeatState(room,connectionOrigin);
        ack({success:true,data:{seatId:String(seatId??""),locked:Boolean(locked),seatState}});
      }catch(error){
        console.error("Audio room seat lock failed",error);
        ack({success:false,error:{code:"SEAT_LOCK_FAILED"}});
      }
    });
    socket.on("audio-room:seat-kick",async({roomId,seatId}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const targetSeatId=String(seatId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id}});
        if(!room||room.status!=="LIVE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(room.ownerId!==user.id)return ack({success:false,error:{code:"OWNER_REQUIRED"}});
        const targetSeat=await prisma.audioRoomSeat.findUnique({
          where:{audioRoomId_seatId:{audioRoomId:room.id,seatId:targetSeatId}},
          include:{occupant:{select:{publicId:true,name:true}}},
        });
        if(!targetSeat?.occupant||!targetSeat.occupantUserId)return ack({success:false,error:{code:"SEAT_NOT_OCCUPIED"}});
        const kickedUserId=targetSeat.occupant.publicId;
        const trtc=issueTrtcAccess({publicId:kickedUserId,name:targetSeat.occupant.name},id,false);
        const result=await leaveAudioRoomSeat(room.id,targetSeat.occupantUserId,targetSeatId);
        if(!result.count)return ack({success:false,error:{code:"SEAT_NOT_OCCUPIED"}});
        const seatState=await broadcastAudioRoomSeatState(room,connectionOrigin);
        io.to(`user:${kickedUserId}`).emit("audio-room:seat-kicked",{
          success:true,
          data:{roomId:id,seatId:targetSeatId,trtc},
        });
        ack({success:true,data:{seatId:targetSeatId,kickedUserId,seatState}});
      }catch(error){
        console.error("Audio room seat kick failed",error);
        ack({success:false,error:{code:error?.message==="TRTC_NOT_CONFIGURED"?"TRTC_NOT_CONFIGURED":"SEAT_KICK_FAILED"}});
      }
    });
    socket.on("audio-room:seat-request",async({roomId,seatId,note}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id},include:{owner:{select:{publicId:true}}}});
        if(!room||room.status!=="LIVE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(room.owner.publicId===userId)return ack({success:false,error:{code:"VIEWER_REQUIRED"}});
        if(!socket.rooms.has(`audio-room:${id}`))return ack({success:false,error:{code:"JOIN_ROOM_FIRST"}});
        const requestId=randomUUID();
        const requesterPerks=(await resolveUserPerks([user],connectionOrigin,["FRAMES","BADGES"])).get(user.publicId);
        const data={requestId,roomId:id,requesterId:userId,requesterName:user.name,requesterProfileImage:user.profileImage??null,requesterGender:user.gender??null,requesterDob:formatDateOnly(user.dob),requesterIsVerified:Boolean(user.isVerified),requesterIsOfficial:Boolean(user.isOfficial),requesterFrameUrl:requesterPerks?.frameUrl??null,requesterBadgeUrl:requesterPerks?.badgeUrl??null,seatId:seatId??null,note:typeof note==="string"?note.slice(0,500):null,requestedAt:new Date().toISOString()};
        io.to(`user:${room.owner.publicId}`).emit("audio-room:seat-request",{success:true,data});
        ack({success:true,data:{requestId,roomId:id,status:"PENDING"}});
      }catch(error){
        console.error("Audio room seat request failed",error);
        ack({success:false,error:{code:"SEAT_REQUEST_FAILED"}});
      }
    });
    socket.on("audio-room:seat-leave",async({roomId,seatId}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id}});
        if(!room||room.status!=="LIVE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(!socket.rooms.has(`audio-room:${id}`))return ack({success:false,error:{code:"JOIN_ROOM_FIRST"}});
        const result=await leaveAudioRoomSeat(room.id,user.id,String(seatId??"")||null);
        if(!result.count)return ack({success:false,error:{code:"SPEAKER_NOT_SEATED"}});
        const isOwner=room.ownerId===user.id;
        const seatState=await broadcastAudioRoomSeatState(room,connectionOrigin);
        const trtc=issueTrtcAccess(user,id,isOwner);
        ack({success:true,data:{roomId:id,seatId:String(seatId??"")||null,userId,leftAt:new Date().toISOString(),seatState,trtc}});
      }catch(error){
        console.error("Audio room seat leave failed",error);
        ack({success:false,error:{code:error?.message==="TRTC_NOT_CONFIGURED"?"TRTC_NOT_CONFIGURED":"SEAT_LEAVE_FAILED"}});
      }
    });
    socket.on("audio-room:seat-response",async({roomId,requestId,requesterId,seatId,accepted,reason}={},ack=()=>{})=>{
      try{
        const id=String(roomId??"");
        const targetUserId=String(requesterId??"");
        const room=await prisma.audioRoom.findUnique({where:{roomId:id},include:{owner:{select:{publicId:true}}}});
        if(!room||room.status!=="LIVE")return ack({success:false,error:{code:"ROOM_UNAVAILABLE"}});
        if(room.owner.publicId!==userId)return ack({success:false,error:{code:"OWNER_REQUIRED"}});
        const viewerSockets=await io.in(`user:${targetUserId}`).fetchSockets();
        if(!viewerSockets.some((viewer)=>viewer.rooms.has(`audio-room:${id}`)))return ack({success:false,error:{code:"VIEWER_NOT_IN_ROOM"}});
        let trtc=null;
        let seatState=null;
        if(Boolean(accepted)){
          const targetUser=await prisma.user.findUnique({where:{publicId:targetUserId},select:{id:true,publicId:true,name:true}});
          if(!targetUser)return ack({success:false,error:{code:"VIEWER_NOT_IN_ROOM"}});
          await takeAudioRoomSeat(room,targetUser.id,String(seatId??""));
          trtc=issueTrtcAccess(targetUser,id,true);
          seatState=await broadcastAudioRoomSeatState(room,connectionOrigin);
        }
        const data={requestId:String(requestId??""),roomId:id,requesterId:targetUserId,seatId:seatId??null,accepted:Boolean(accepted),reason:typeof reason==="string"?reason.slice(0,500):null,respondedAt:new Date().toISOString(),seatState,trtc};
        io.to(`user:${targetUserId}`).emit("audio-room:seat-response",{success:true,data});
        ack({success:true,data:{requestId:data.requestId,roomId:id,delivered:true}});
      }catch(error){
        console.error("Audio room seat response failed",error);
        ack({success:false,error:{code:"SEAT_RESPONSE_FAILED"}});
      }
    });
    socket.on("audio-room:leave",async({roomId}={},ack=()=>{})=>{
      const id=String(roomId??"");
      const room=await prisma.audioRoom.findUnique({where:{roomId:id},include:{owner:{select:{publicId:true}}}});
      const isOwner=room?.owner?.publicId===socket.data.userId;
      await socket.leave(`audio-room:${id}`);
      if(room&&isOwner){
        const ownerSeat=await prisma.audioRoomSeat.findFirst({where:{audioRoomId:room.id,occupantUserId:user.id},select:{id:true}});
        if(ownerSeat){
          await prisma.audioRoomSeat.update({where:{id:ownerSeat.id},data:{occupantUserId:null,occupiedAt:null,isMuted:true,isSpeaking:false}});
        }
      }else if(room){
        await leaveAudioRoomSeat(room.id,user.id);
      }
      const participantCount=io.sockets.adapter.rooms.get(`audio-room:${id}`)?.size??0;
      if(isOwner&&participantCount>0){
        io.to(`audio-room:${id}`).emit("audio-room:owner-left",{success:true,data:{roomId:id,reason:"OWNER_LEFT"}});
      }
      if(participantCount){
        await prisma.audioRoom.updateMany({where:{roomId:id,status:"LIVE"},data:{participantCount}});
        if(room)await broadcastAudioRoomSeatState(room,connectionOrigin,participantCount);
      }
      else await releaseEmptyAudioRoom(id);
      ack({success:true,data:{roomId:id,participantCount,idRetained:true}});
    });
    socket.on("disconnecting",()=>{
      const roomIds=[...socket.rooms].filter((name)=>name.startsWith("audio-room:")).map((name)=>name.slice(11));
      for(const roomId of roomIds){
        setTimeout(async()=>{
          try{
            const room=await prisma.audioRoom.findUnique({where:{roomId},include:{owner:{select:{publicId:true}}}});
            const isOwner=room?.owner?.publicId===socket.data.userId;
            const remaining=io.sockets.adapter.rooms.get(`audio-room:${roomId}`)?.size??0;
            if(room&&isOwner){
              const ownerSeat=await prisma.audioRoomSeat.findFirst({where:{audioRoomId:room.id,occupantUserId:user.id},select:{id:true}});
              if(ownerSeat){
                await prisma.audioRoomSeat.update({where:{id:ownerSeat.id},data:{occupantUserId:null,occupiedAt:null,isMuted:true,isSpeaking:false}});
              }
            }else if(room){
              const userSockets=await io.in(`user:${userId}`).fetchSockets();
              const stillJoined=userSockets.some((viewer)=>viewer.id!==socket.id&&viewer.rooms.has(`audio-room:${roomId}`));
              if(!stillJoined){
                await leaveAudioRoomSeat(room.id,user.id);
              }
            }
            if(isOwner&&remaining>0){
              io.to(`audio-room:${roomId}`).emit("audio-room:owner-left",{success:true,data:{roomId,reason:"OWNER_LEFT"}});
            }
            if(room&&remaining>0)await broadcastAudioRoomSeatState(room,connectionOrigin,remaining);
            await releaseEmptyAudioRoom(roomId);
          }catch(error){
            console.error("Audio room disconnect cleanup failed",error);
          }
        },0);
      }
    });
  });

  httpServer.listen(port,hostname,()=>console.log(`> Portal and Socket.IO ready on http://${hostname}:${port}`));
}).catch((error)=>{
  if(error?.code==="P1000"){
    console.error("> Portal startup failed: PostgreSQL rejected DATABASE_URL credentials. Replace the placeholder username/password in .env.local with a valid PostgreSQL account.");
  }else{
    console.error("> Portal startup failed",error);
  }
  process.exit(1);
});
