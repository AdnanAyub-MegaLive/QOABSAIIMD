// Explicit production QA. Only the named QA accounts may be funded/used.
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
dotenv.config({path:'.env.local',quiet:true});
const {prisma}=await import('../src/lib/prisma.js');
const {ledgerData}=await import('../src/lib/wallet.js');
const {default:sessions}=await import('../src/lib/mobile-session.cjs');
const {default:bcrypt}=await import('bcrypt');
const run=`qa-burst-${randomUUID()}`, sockets=[];
let room;
function connect(token) {return new Promise((resolve,reject)=>{
 const ws=new WebSocket('wss://portal.megachat.live/socket.io/?EIO=4&transport=websocket');sockets.push(ws);
 const events=[],pending=new Map();let n=0;
 const timer=setTimeout(()=>reject(Error('connect timeout')),15000);
 ws.onerror=()=>reject(Error('socket failed'));
 ws.onmessage=({data})=>{const s=String(data);
  if(s.startsWith('0'))ws.send(`40${JSON.stringify({token})}`);
  else if(s==='2')ws.send('3');
  else if(s.startsWith('40')){clearTimeout(timer);resolve({events,call:(name,input)=>new Promise((done,fail)=>{
   const id=++n,t=setTimeout(()=>{pending.delete(id);fail(Error(`${name} timeout`));},15000);
   pending.set(id,v=>{clearTimeout(t);done(v);});ws.send(`42${id}${JSON.stringify([name,input])}`);
  })});}
  else if(s.startsWith('43')){const m=/^43(\d+)(\[.*)$/s.exec(s);if(m){pending.get(+m[1])?.(JSON.parse(m[2])[0]);pending.delete(+m[1]);}}
  else if(s.startsWith('42['))events.push({at:Date.now(),event:JSON.parse(s.slice(2))});
  else if(s.startsWith('44')){clearTimeout(timer);reject(Error('socket auth failed'));}
 };
});}
try {
 const users=await prisma.user.findMany({where:{publicId:{in:['USR-696194','USR-372931']}}});
 const a=users.find(u=>u.publicId==='USR-696194');let b=users.find(u=>u.publicId==='USR-372931');
 for(const u of [a,b])assert(u?.name.startsWith('QA SVGA Verification')&&u.status==='ACTIVE'&&!u.deletedAt&&!u.agencyId&&!u.appRoles.includes('HOST'),'QA identity guard');
 const gift=await prisma.uploadAsset.findFirst({where:{category:'GIFTS',giftTier:'CLASSIC',active:true,coinPrice:{gt:0n,lte:100n}},orderBy:{coinPrice:'asc'}});
 assert(gift,'No low-price ordinary gift; no funding performed');
 // Existing QA owner already has a persistent room. Use a fresh isolated
 // receiver rather than changing that room or its historical state.
 b=await prisma.user.create({data:{publicId:`USR-QA-${randomUUID().slice(0,8)}`,name:'QA Gift Burst Receiver',appRoles:['LISTENER']}});
 const password=randomUUID();
 room=await prisma.audioRoom.create({data:{roomId:`ROOM-QA-${randomUUID()}`,ownerId:b.id,title:'Isolated gift delivery QA',privacyMode:'PASSWORD',passwordHash:await bcrypt.hash(password,10),seatLayout:[1]}});
 process.env.MOBILE_SESSION_TTL_SECONDS='300';
 const token=sessions.createMobileSessionToken(a);
 const [sender,receiver]=await Promise.all([connect(token),connect(sessions.createMobileSessionToken(b))]);
 for(const socket of [receiver,sender]){const joined=await socket.call('audio-room:join',{roomId:room.roomId,password});assert(joined.success,JSON.stringify(joined));}
 const required=gift.coinPrice*20n;
 await prisma.$transaction(async tx=>{
  const current=await tx.user.findUniqueOrThrow({where:{id:a.id}});
  assert.equal(current.coinBalance,a.coinBalance,'QA balance changed concurrently');
  await tx.user.update({where:{id:a.id},data:{coinBalance:{increment:required}}});
  await tx.walletTransaction.create({data:ledgerData({userId:a.id,type:'ADMIN_ADJUSTMENT',direction:'CREDIT',coins:required,title:'Authorized dedicated QA burst funding',referenceId:run,metadata:{qa:true,run}})});
 },{isolationLevel:'Serializable'});
 console.log(JSON.stringify({run,accounts:[a.publicId,b.publicId],roomId:room.roomId,gift:gift.publicId,tier:gift.giftTier,funded:required.toString()}));
 const body={recipientId:b.publicId,giftId:gift.publicId,roomId:room.roomId,quantity:1};
 async function send(key){const start=Date.now();const r=await fetch('https://portal.megachat.live/api/gifts/send',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});return {key,start,end:Date.now(),status:r.status,body:await r.json()};}
 const results=[];
 // Four concurrent requests at a time, twenty unique operations total.
 for(let i=0;i<20;i+=4)results.push(...await Promise.all(Array.from({length:4},(_,j)=>send(`${run}-${i+j}`))));
 const successful=results.filter(r=>r.body.success);
 assert(successful.length,'No successful sends');
 const first=successful[0];
 const replay=await send(first.key);
 assert.deepEqual(replay.body,first.body,'Replay response differs');
 for(let i=0;i<50 && receiver.events.filter(e=>e.event[0]==='gift:received').length<successful.length;i++)await new Promise(r=>setTimeout(r,100));
 const events=receiver.events.filter(e=>e.event[0]==='gift:received');
 const rows=await prisma.giftRequest.findMany({where:{senderId:a.id,key:{startsWith:run}}});
 const balance=await prisma.user.findUniqueOrThrow({where:{id:a.id},select:{coinBalance:true}});
 const debits=await prisma.walletTransaction.findMany({where:{userId:a.id,type:'GIFT_SENT',referenceId:{in:successful.map(r=>r.body.data.transactionId)}},select:{coins:true}});
 const outbox=await prisma.realtimeOutbox.findMany({where:{channel:`audio-room:${room.roomId}`,event:'gift:received'},select:{id:true,createdAt:true,deliveredAt:true}});
 const measurements=successful.map(r=>{const e=events.find(e=>e.event[1]?.data?.requestId===r.key);const o=outbox.find(o=>o.id===e?.event[1]?.data?.eventId);return {requestId:r.key,httpMs:r.end-r.start,receiverMs:e?e.at-r.start:null,outboxToReceiverMs:e&&o?e.at-o.createdAt.getTime():null};});
 assert.equal(balance.coinBalance,a.coinBalance+required-gift.coinPrice*BigInt(successful.length));
 assert.equal(debits.length,successful.length);assert.equal(rows.length,successful.length);
 console.log(JSON.stringify({run,successes:successful.length,failures:results.filter(r=>!r.body.success).map(r=>({status:r.status,error:r.body.error})),received:events.length,uniqueEventIds:new Set(events.map(e=>e.event[1]?.data?.eventId)).size,replayIdentical:true,ledgerDebits:debits.length,balance:balance.coinBalance.toString(),pendingOutbox:outbox.filter(o=>!o.deliveredAt).length,measurements},null,2));
}finally{
 for(const socket of sockets)socket.close();
 if(room)await prisma.audioRoom.update({where:{id:room.id},data:{status:'ENDED'}});
 await prisma.$disconnect();
}
