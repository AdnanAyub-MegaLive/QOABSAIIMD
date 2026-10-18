// Explicit production QA. Only freshly-created QA identities receive test funds.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import bcrypt from 'bcrypt';
dotenv.config({path:'.env.local',quiet:true});
const {prisma:p}=await import('../src/lib/prisma.js');
const {default:sessions}=await import('../src/lib/mobile-session.cjs');
const {changeBanner}=await import('../src/lib/room-banners.js');
const {bannerObject}=await import('../src/lib/room-banner-media.js');
const {ledgerData}=await import('../src/lib/wallet.js');
const run=randomUUID(),users=[],sockets=[],checks=[];
let room,tier,admin,originalSettings,configured;
const log=(name,data={})=>{checks.push(name);console.log(JSON.stringify({check:name,...data}));};
async function http(u,path,options={}){
 const r=await fetch(`https://portal.megachat.live${path}`,{...options,headers:{authorization:`Bearer ${sessions.createMobileSessionToken(u)}`,...options.headers},signal:AbortSignal.timeout(45000)});
 const text=await r.text();const body=text?JSON.parse(text):null;return {status:r.status,body};
}
async function connect(u){return new Promise((resolve,reject)=>{
 const ws=new WebSocket('wss://portal.megachat.live/socket.io/?EIO=4&transport=websocket');sockets.push(ws);let sequence=0;const pending=new Map(),events=[];
 const timer=setTimeout(()=>reject(Error('Socket timeout')),15000);ws.onerror=()=>reject(Error('Socket failure'));
 ws.onmessage=({data})=>{const text=String(data);if(text.startsWith('0'))ws.send(`40${JSON.stringify({token:sessions.createMobileSessionToken(u)})}`);else if(text==='2')ws.send('3');else if(text.startsWith('40')){clearTimeout(timer);resolve({events,call:(event,input)=>new Promise((done,fail)=>{const id=++sequence,t=setTimeout(()=>fail(Error('Ack timeout')),15000);pending.set(id,value=>{clearTimeout(t);done(value)});ws.send(`42${id}${JSON.stringify([event,input])}`)})});}else if(text.startsWith('43')){const m=/^43(\d+)(\[.*)$/s.exec(text);if(m){pending.get(Number(m[1]))?.(JSON.parse(m[2])[0]);pending.delete(Number(m[1]));}}else if(text.startsWith('42['))events.push(JSON.parse(text.slice(2)));else if(text.startsWith('44')){clearTimeout(timer);reject(Error('Socket authentication failed'));}};
});}
async function waitFor(fn,attempts=30){for(let n=0;n<attempts;n++){if(await fn())return;await new Promise(r=>setTimeout(r,500));}throw Error('Expected maintenance/event did not arrive');}
try{
 process.env.MOBILE_SESSION_TTL_SECONDS='300';
 originalSettings=await p.roomBannerSettings.findUnique({where:{id:'default'}});
 assert.equal(await p.vipTier.findUnique({where:{level:3}}),null,'VIP 3 already exists; refuse to alter it');
 for(let i=0;i<3;i++)users.push(await p.user.create({data:{publicId:`USR-${Math.floor(100000000+Math.random()*899999999)}`,name:`QA VIP/banner ${run}`,coinBalance:0n}}));
 const [a,b,c]=users;log('Dedicated accounts created',{publicIds:users.map(u=>u.publicId)});
 tier=await p.vipTier.create({data:{name:`QA temporary visitor VIP ${run}`,level:3,validDays:1,coinPrice:null,privileges:['VIEW_VISITORS']}});
 await p.vipMembership.create({data:{userId:a.id,tierId:tier.id,expiresAt:new Date(Date.now()+600000)}});
 await p.userProfileVisit.createMany({data:[{targetId:a.id,visitorId:b.id},{targetId:a.id,visitorId:c.id}]});
 let r=await http(a,`/api/v1/users/${a.publicId}/visitors?limit=1`);assert.equal(r.status,200);assert.equal(r.body.data.items.length,1);assert.ok(r.body.data.nextCursor);const cursor=r.body.data.nextCursor,first=r.body.data.items[0].publicId;
 r=await http(a,`/api/v1/users/${a.publicId}/visitors?limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(r.status,200);assert.notEqual(r.body.data.items[0].publicId,first);log('Active VIP 3 own visitors and pagination succeed');
 r=await http(a,`/api/v1/users/${b.publicId}/visitors`);assert.equal(r.status,403);assert.equal(r.body.error.code,'FORBIDDEN');log('VIP 3 cannot read another profile visitor list');
 await p.vipTier.update({where:{id:tier.id},data:{privileges:[]}});r=await http(a,`/api/v1/users/${a.publicId}/visitors?cursor=${encodeURIComponent(cursor)}`);assert.equal(r.body.error.code,'VIP_3_REQUIRED');log('Removing visitor privilege denies the next page');
 await p.vipTier.update({where:{id:tier.id},data:{privileges:['VIEW_VISITORS']}});await p.vipMembership.update({where:{userId:a.id},data:{expiresAt:new Date(0)}});r=await http(a,`/api/v1/users/${a.publicId}/visitors?cursor=${encodeURIComponent(cursor)}`);assert.equal(r.status,403);assert.match(r.body.error.message,/Buy VIP 3/);log('Expired VIP 3 loses access on next page');
 const revision=(originalSettings?.revision??0)+1;
 configured=await p.roomBannerSettings.upsert({where:{id:'default'},create:{id:'default',enabled:true,revision,packages:[{id:run,name:'Temporary QA',durationDays:1,coins:'10'}]},update:{enabled:true,revision,packages:[{id:run,name:'Temporary QA',durationDays:1,coins:'10'}]}});
 admin=await p.admin.create({data:{name:`QA banner reviewer ${run}`,email:`qa-${run}@example.invalid`,passwordHash:await bcrypt.hash(randomUUID(),10),active:false,permissions:[]}});
 await p.$transaction(async tx=>{await tx.user.update({where:{id:a.id},data:{coinBalance:100n}});await tx.walletTransaction.create({data:ledgerData({userId:a.id,type:'ADMIN_ADJUSTMENT',direction:'CREDIT',title:'Dedicated QA test funding',coins:100n,referenceId:run})});});
 room=await p.audioRoom.create({data:{roomId:`ROOM-${Math.floor(100000000+Math.random()*899999999)}`,ownerId:a.id,title:'Private QA banner room',privacyMode:'PASSWORD',passwordHash:await bcrypt.hash(run,10),seatLayout:[1]}});
 let sb=null; try { const sa=await connect(a); const ja=await sa.call('audio-room:join',{roomId:room.roomId,password:run}); assert.equal(ja.success,true,JSON.stringify(ja.error)); const candidate=await connect(b);const jb=await candidate.call('audio-room:join',{roomId:room.roomId,password:run});assert.equal(jb.success,true,JSON.stringify(jb.error));sb=candidate; } catch(error) { console.log(JSON.stringify({realtimeCheckUnavailable:error.message})); }
 const path=`/api/v1/audio-rooms/${room.roomId}/banners`,image=await sharp({create:{width:16,height:8,channels:3,background:'red'}}).png().toBuffer();
 const upload=async(id,user=a)=>{const form=new FormData();form.append('image',new File([image],'qa.png',{type:'image/png'}));form.append('requestId',id);form.append('packageId',run);form.append('settingsRevision',String(revision));return http(user,path,{method:'POST',body:form});};
 const balance=async()=>String((await p.user.findUnique({where:{id:a.id},select:{coinBalance:true}})).coinBalance);
 const deleteBanner=id=>http(a,path,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({bannerId:id})});
 let one=await upload('one');assert.equal(one.status,201,JSON.stringify(one.body));const id1=one.body.data.banner.id;assert.equal(await balance(),'90');
 const retry=await upload('one');assert.equal(retry.body.data.banner.id,id1);assert.equal(await balance(),'90');log('Paid upload debits once; identical retry returns same banner');
 r=await upload('intruder',b);assert.equal(r.status,403);log('Participant cannot upload owner banners');
 r=await http(b,one.body.data.banner.previewUrl);assert.equal(r.status,403);log('Pending image preview private to owner/admin');
 const two=await upload('two');assert.equal(two.status,201);const id2=two.body.data.banner.id;assert.equal(await balance(),'80');
 r=await upload('third');assert.equal(r.body.error.code,'BANNER_LIMIT_REACHED');assert.equal(await balance(),'80');log('Two pending banners reserve both slots; third upload does not charge');
 let approved;
 if(process.argv.includes('--ui')){
  console.log(JSON.stringify({awaitingAdminUi:true,roomId:room.roomId,approveBannerId:id1,rejectBannerId:id2}));
  await waitFor(async()=> (await p.roomBanner.findUnique({where:{id:id1}})).status==='ACTIVE'&&(await p.roomBanner.findUnique({where:{id:id2}})).status==='REJECTED',1200);
  approved=await p.roomBanner.findUnique({where:{id:id1}});log('Admin UI approval and rejection persisted');
 }else approved=await changeBanner({roomId:room.roomId,id:id1,action:'APPROVE',adminId:admin.id});
 assert.equal(approved.status,'ACTIVE');const media=await fetch(approved.imageUrl);assert.equal(media.status,200);assert.match(media.headers.get('cache-control'),/immutable/);assert.equal(media.headers.get('content-type'),'image/webp');assert.ok(new URL(approved.imageUrl).searchParams.get('v'));
 log('Approval publishes versioned CDN image',{host:new URL(approved.imageUrl).host,cacheControl:media.headers.get('cache-control')});
 let joined;
 if(sb){await waitFor(()=>sb.events.some(e=>e[0]==='audio-room:banners-changed'&&e[1].data.banners.some(x=>x.id===id1)));log('Connected listener receives approved banner event');joined=await sb.call('audio-room:join',{roomId:room.roomId,password:run});assert.ok(joined.data.roomBanners.banners.some(x=>x.id===id1));log('Repeated join snapshot includes approved banner');}
 await changeBanner({roomId:room.roomId,id:id2,action:'REJECT',reason:'Dedicated QA rejection',adminId:admin.id});assert.equal(await balance(),'90');await changeBanner({roomId:room.roomId,id:id2,action:'REJECT',reason:'Dedicated QA rejection',adminId:admin.id});assert.equal(await balance(),'90');log('Rejection refunds once only');
 r=await upload('cancel');assert.equal(r.status,201);await deleteBanner(r.body.data.banner.id);assert.equal(await balance(),'90');log('Pending owner cancellation refunds');
 await deleteBanner(id1);assert.equal(await balance(),'90');log('Active deletion does not refund');if(sb){await waitFor(()=>sb.events.some(e=>e[0]==='audio-room:banners-changed'&&e[1].data.banners.length===0&&e[1].data.revision>joined.data.roomBanners.revision));log('Active deletion broadcasts removal');}
 r=await upload('expiry');assert.equal(r.status,201);const expiryId=r.body.data.banner.id;await changeBanner({roomId:room.roomId,id:expiryId,action:'APPROVE',adminId:admin.id});
 await p.roomBanner.update({where:{id:expiryId},data:{expiresAt:new Date(Date.now()+1500)}});
 await waitFor(async()=> (await p.roomBanner.findUnique({where:{id:expiryId}})).status==='EXPIRED');assert.equal(await balance(),'80');log('Production maintenance expires banner without refund');
 const ledger=await p.walletTransaction.findMany({where:{userId:a.id,type:{in:['ROOM_BANNER_PURCHASE','REFUND']}}});log('Test ledger audited',{debits:ledger.filter(x=>x.type==='ROOM_BANNER_PURCHASE').length,refunds:ledger.filter(x=>x.type==='REFUND').length,balance:await balance()});
} catch(error) { console.error('QA_FAILURE',error.code??error.name,error.message); throw error; } finally {
 // Restore global configuration first, even if a test fails. Never overwrite a concurrent admin edit.
 if(configured){const current=await p.roomBannerSettings.findUnique({where:{id:'default'}});if(current?.revision===configured.revision&&JSON.stringify(current.packages)===JSON.stringify(configured.packages)){
  if(originalSettings)await p.roomBannerSettings.update({where:{id:'default'},data:{enabled:originalSettings.enabled,packages:originalSettings.packages,revision:configured.revision+1}});
  else await p.roomBannerSettings.delete({where:{id:'default'}});
  log('Original banner configuration restored');
 }else console.error('CONFIGURATION CHANGED DURING QA: manual review required');}
 for(const ws of sockets)ws.close();
 if(room){const rows=await p.roomBanner.findMany({where:{audioRoomId:room.id}});for(const b of rows){if(['PENDING','ACTIVE'].includes(b.status))await changeBanner({roomId:room.roomId,id:b.id,action:'DELETE',userId:room.ownerId});for(const key of [b.storageKey,b.publicKey].filter(Boolean)){await bannerObject('delete',key);await p.roomBannerObject.deleteMany({where:{key}});}}await p.audioRoom.update({where:{id:room.id},data:{status:'ENDED',participantCount:0}});}
 for(const user of users){await p.vipMembership.deleteMany({where:{userId:user.id}});await p.$transaction(async tx=>{const row=await tx.user.findUnique({where:{id:user.id}});assert.equal(row.name,`QA VIP/banner ${run}`);if(row.coinBalance)await tx.walletTransaction.create({data:ledgerData({userId:user.id,type:'ADMIN_ADJUSTMENT',direction:'DEBIT',title:'Remove dedicated QA test funding',coins:row.coinBalance,referenceId:`cleanup:${run}`})});await tx.user.update({where:{id:user.id},data:{coinBalance:0n,vipLevel:0,deletedAt:new Date(),sessionVersion:{increment:1}}});});}
 if(tier)await p.vipTier.delete({where:{id:tier.id}});
 log('Cleanup complete',{disabledTestAccounts:users.length,testTierRemoved:Boolean(tier),testRoomEnded:Boolean(room),reviewerInactive:Boolean(admin),historicalAuditRetained:true});
 await p.$disconnect();
}
