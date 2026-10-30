import { giftMedia } from './gift-media.js';
import { randomUUID } from 'node:crypto';
const fail = code => { throw Object.assign(new Error(code), { code }); };
// Ephemeral visual feedback only. Never use this event for balances, rewards,
// chat history, rankings or a settlement receipt. Old clients simply ignore it.
export async function roomGiftPreview(db, socket, user, input, origin, now = Date.now()) {
  const {roomId, giftId, giftBatchId, quantity = 1, recipientIds} = input ?? {};
  if (![roomId,giftId,giftBatchId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)) ||
      !Array.isArray(recipientIds) || recipientIds.length<1 || recipientIds.length>26 ||
      recipientIds.some(v=>typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v)) ||
      !Number.isInteger(quantity) || quantity<1 || quantity>999) fail('VALIDATION_ERROR');
  const channel=`audio-room:${roomId}`;
  if (!socket.rooms.has(channel)) fail('JOIN_ROOM_FIRST');
  const [room,gift] = await Promise.all([
    db.audioRoom.findUnique({
      where:{roomId},
      select:{
        status:true,isBlocked:true,owner:{select:{publicId:true}},
        seats:{where:{occupantUserId:{not:null}},select:{occupant:{select:{publicId:true}}}},
      },
    }),
    db.uploadAsset.findFirst({where:{publicId:giftId,category:'GIFTS',active:true,giftTier:'LUCKY',coinPrice:{gt:0n}},select:{publicId:true,name:true,category:true,active:true,isGlobal:true,storeVisible:true,mimeType:true,mediaVersion:true,posterMimeType:true,posterMediaVersion:true,cdnUrl:true,posterCdnUrl:true}}),
  ]);
  if (!room || room.status!=='LIVE' || room.isBlocked || !socket.rooms.has(channel)) fail('ROOM_UNAVAILABLE');
  if (!gift) fail('GIFT_NOT_FOUND');
  const seated = new Set([room.owner.publicId,...room.seats.map(s=>s.occupant?.publicId)]);
  const targets=[...new Set(recipientIds)];
  if(targets.some(id=>!seated.has(id))) fail('ROOM_PARTICIPANT_REQUIRED');
  return {preview:true,transactionId:`preview:${giftBatchId}`,giftBatchId,roomId,recipientIds:targets,
    serverTime:new Date(now).toISOString(),expiresAt:new Date(now+3000).toISOString(),
    sender:{id:user.publicId,publicId:user.publicId,name:user.name},
    gift:{id:gift.publicId,name:gift.name,category:'LUCKY',quantity,...giftMedia(gift,origin)}};
}
export function registerRoomGiftPreviews({db,socket,user,origin,now=Date.now}) {
  const seen=new Map();let windowAt=0,count=0,inFlight=0;
  socket.on('audio-room:gift-preview',async(input={},ack=()=>{})=>{
    const reply = value => { if(typeof ack==='function')ack(value); };
    let key;
    try {
      const at=now();
      if(at-windowAt>=1000){windowAt=at;count=0;}
      if(++count>30 || inFlight>=8) return reply({success:false,error:{code:'PREVIEW_RATE_LIMITED'}});
      for(const [key,time] of seen) if(at-time>60000)seen.delete(key);
      // A batch identifies the whole combo, NOT a tap. Older apps without a
      // per-tap ID still get each preview; never deduplicate by batch alone.
      const tapId=input.previewId ?? input.requestId;
      if(tapId!=null && (typeof tapId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(tapId)))fail('VALIDATION_ERROR');
      key=tapId==null?null:JSON.stringify([input.roomId,tapId]);
      if(key && seen.has(key))return reply({success:true,data:{duplicate:true,previewId:tapId}});
      while(seen.size>=512)seen.delete(seen.keys().next().value);
      if(key)seen.set(key,at);inFlight++;
      try {
        const data=await roomGiftPreview(db,socket,user,input,origin,at);
        if(now()-at>3000){if(key)seen.delete(key);return reply({success:false,error:{code:'PREVIEW_EXPIRED'}});}
        data.previewId=tapId??randomUUID();
        data.transactionId=`preview:${data.previewId}`;
        socket.to(`audio-room:${data.roomId}`).volatile.emit('audio-room:gift-preview',{success:true,data});
        reply({success:true,data:{previewId:data.previewId,giftBatchId:data.giftBatchId,expiresAt:data.expiresAt}});
      } finally {inFlight--;}
    } catch(error) {if(key)seen.delete(key);reply({success:false,error:{code:error.code ?? 'PREVIEW_UNAVAILABLE'}});}
  });
}
