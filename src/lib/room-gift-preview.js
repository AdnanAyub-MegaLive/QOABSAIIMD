import { giftMedia } from './gift-media.js';
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
    db.uploadAsset.findFirst({where:{publicId:giftId,category:'GIFTS',active:true,giftTier:'LUCKY',coinPrice:{gt:0n}}}),
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
    try {
      const at=now();
      if(at-windowAt>=1000){windowAt=at;count=0;}
      if(++count>30 || inFlight>=8) return;
      for(const [key,time] of seen) if(at-time>60000)seen.delete(key);
      const key=input.giftBatchId;
      if(typeof key!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(key) || seen.has(key))return;
      while(seen.size>=512)seen.delete(seen.keys().next().value);
      seen.set(key,at);inFlight++;
      try {
        const data=await roomGiftPreview(db,socket,user,input,origin,at);
        if(now()-at>3000)return;
        socket.to(`audio-room:${data.roomId}`).volatile.emit('audio-room:gift-preview',{success:true,data});
        if(typeof ack==='function')ack({success:true});
      } finally {inFlight--;}
    } catch(error) {if(typeof ack==='function')ack({success:false,error:{code:error.code ?? 'PREVIEW_UNAVAILABLE'}});}
  });
}
