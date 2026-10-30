// Real HTTP/Socket.IO verification. Default: disposable local database and server.
// --deployed uses private, zero-balance QA users/room on the configured deployment;
// no real user's membership, balances, or moderation state are changed.
import {config} from 'dotenv';
import {Client} from 'pg';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {openSync,closeSync,readFileSync} from 'node:fs';
import {io} from 'socket.io-client';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
config({path:'.env.local',quiet:true});
const deployed=process.argv.includes('--deployed');
const run=randomUUID().replaceAll('-','').slice(0,12), databaseName=`vip_test_${run}`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let admin,server,logFd,db,tier,room,agency,created=false;const users=[],sockets=[];
try{
 if(!deployed){
  const url=new URL(process.env.DATABASE_URL);url.pathname='/postgres';admin=new Client({connectionString:url.href});await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);created=true;url.pathname=`/${databaseName}`;process.env.DATABASE_URL=url.href;
  Object.assign(process.env,{AUTH_SECRET:randomBytes(48).toString('hex'),PORT:'3116',HOSTNAME:'127.0.0.1',MOBILE_API_BASE_URL:'http://127.0.0.1:3116',RTC_PROVIDER:'LIVEKIT',LIVEKIT_URL:'wss://vip-test.example.com',LIVEKIT_API_KEY:'vip-test',LIVEKIT_API_SECRET:randomBytes(32).toString('hex')});
  delete process.env.REALTIME_DATABASE_URL;
  const push=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','push'],{env:process.env,encoding:'utf8'});assert.equal(push.status,0,'Disposable schema failed');
  // db push cannot install SQL triggers. Recreate this empty table only in the new disposable database.
  const hooks=new Client({connectionString:process.env.DATABASE_URL});await hooks.connect();
  try{await hooks.query('DROP TABLE "AudioRoomMicSession"');await hooks.query(readFileSync('prisma/migrations/20261030210000_audio_mic_attendance/migration.sql','utf8'));await hooks.query('ALTER TABLE "User" DROP COLUMN "hostSince"');await hooks.query(readFileSync('prisma/migrations/20261030220000_host_since/migration.sql','utf8'));}finally{await hooks.end();}

 }
 ({prisma:db}=await import('../src/lib/prisma.js'));
 const {createMobileSessionToken}= (await import('../src/lib/mobile-session.cjs')).default;
 const origin=deployed?(process.env.VIP_SMOKE_ORIGIN||'https://portal.megachat.live'):'http://127.0.0.1:3116';
 for(const role of ['owner','admin','observer','vip'])users.push(await db.user.create({data:{publicId:`USR-VIPQA-${run}-${role}`,name:`VIP QA ${role}`,country:'PK',profilePrivate:true}}));
 const [owner,moderator,observer,vip]=users;
 const maxTier=await db.vipTier.aggregate({_max:{level:true}});
 tier=await db.vipTier.create({data:{name:`VIP QA ${run}`,level:(maxTier._max.level??0)+1,validDays:1,privileges:['ANTI_KICK','ANTI_MIC_BAN','ROOM_ANTI_LOCK','INVISIBLE_ENTRY','FORBIDDEN_FOLLOW','LEVEL_BOOST','GIF_ROOM_COVER','RANKING_PRIORITY'],xpMultiplierBps:15000}});
 await db.vipMembership.create({data:{userId:vip.id,tierId:tier.id,expiresAt:new Date(Date.now()+900000)}});
 const password=String(Math.floor(100000+Math.random()*900000));
 room=await db.audioRoom.create({data:{roomId:`VIPQA-${run}`,ownerId:owner.id,title:'Private VIP capability verification',privacyMode:'PASSWORD',passwordHash:await bcrypt.hash(password,4),status:'LIVE',seatLayout:[3]}});
 await db.audioRoomRole.create({data:{audioRoomId:room.id,userId:moderator.id,role:'ADMIN',grantedById:owner.id}});
 const tokens=users.map(u=>createMobileSessionToken(u));
 if(!deployed){logFd=openSync(`/tmp/vip-server-${run}.log`,'w');server=spawn(process.execPath,['server.js'],{env:process.env,stdio:['ignore',logFd,logFd]});}
 for(let i=0;i<120;i++){try{if((await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}if(i===119)throw Error('Server not ready');await delay(250);}
 const request=async(path,actor=0,options={})=>{const response=await fetch(`${origin}${path}`,{...options,headers:{Authorization:`Bearer ${tokens[actor]}`,...options.headers},signal:AbortSignal.timeout(20000)});return {status:response.status,...await response.json()};};
 const joined=async(i,pass)=>{
  const socket=io(origin,{auth:{token:tokens[i]},transports:['websocket'],reconnection:false});sockets[i]=socket;
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);setTimeout(()=>reject(Error('Socket timeout')),15000).unref();});
  const result=await socket.timeout(20000).emitWithAck('audio-room:join',{roomId:room.roomId,...(pass?{password:pass}:{})});assert.equal(result.success,true,JSON.stringify(result));return result;
 };
 await joined(0);await joined(1,password);await joined(2,password);
 const publicEvents=[],adminEvents=[];
 sockets[2].onAny((name,data)=>{if(['audio-room:entrance','audio-room:member-joined'].includes(name))publicEvents.push({name,data});});
 sockets[1].onAny((name,data)=>{if(['audio-room:entrance','audio-room:member-joined'].includes(name))adminEvents.push({name,data});});
 const vipJoined=await joined(3); // no password supplied
 assert.equal(vipJoined.data.permissions.canBypassSeatLock,true);
 assert.equal(vipJoined.data.permissions.canUseGifCover,true);
 await delay(500);
 assert(!publicEvents.some(e=>e.data?.data?.userId===vip.publicId||e.data?.data?.member?.publicId===vip.publicId),'Invisible identity broadcast to ordinary listener');
 assert(!adminEvents.some(e=>e.name==='audio-room:entrance'&&e.data?.data?.userId===vip.publicId),'Invisible entrance broadcast to admin');
 assert(adminEvents.some(e=>e.name==='audio-room:member-joined'&&e.data?.data?.member?.publicId===vip.publicId),'Admin did not receive private membership');
 const path=`/api/v1/audio-rooms/${room.roomId}`;
 const visible=await request(`${path}/members`,2),privileged=await request(`${path}/members`,1);
 assert.equal(visible.status,200,JSON.stringify(visible));assert(!visible.data.members.some(u=>u.publicId===vip.publicId));
 assert(privileged.data.members.some(u=>u.publicId===vip.publicId&&u.vipPrivileges.includes('ANTI_KICK')));
 assert.equal(privileged.data.members[0].publicId,vip.publicId,'VIP not first in member list');
 for(const banMinutes of [null,10]){
  const result=await request(`${path}/kicks`,1,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId:vip.publicId,banMinutes,reason:'Private capability QA'})});
  assert.equal(result.status,403,JSON.stringify(result));assert.equal(result.error.code,'VIP_PROTECTED');
 }
 assert.equal(await db.audioRoomBan.count({where:{audioRoomId:room.id,userId:vip.id}}),0);
 assert((await db.audioRoomMember.findUnique({where:{audioRoomId_userId:{audioRoomId:room.id,userId:vip.id}}})).socketCount>0);
 await db.audioRoomSeat.update({where:{audioRoomId_seatId:{audioRoomId:room.id,seatId:'row0-seat1'}},data:{isLocked:true,isMuted:false}});
 const {takeAudioRoomSeat}=await import('../src/lib/audio-room-seats.js');
 await assert.rejects(takeAudioRoomSeat(room,observer.id,'row0-seat1'),/SEAT_LOCKED/);
 await takeAudioRoomSeat(room,vip.id,'row0-seat1');
 const occupied=await db.audioRoomSeat.findUnique({where:{audioRoomId_seatId:{audioRoomId:room.id,seatId:'row0-seat1'}}});assert.equal(occupied.occupantUserId,vip.id);assert.equal(occupied.isLocked,true);
 const gif=new FormData();gif.set('image',new File([Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')],'qa.gif',{type:'image/gif'}));
 const gifResult=await request('/api/audio-rooms/cover',0,{method:'POST',body:gif});assert.equal(gifResult.error?.code,'GIF_ROOM_COVER_REQUIRED',JSON.stringify(gifResult));
 const muted=await sockets[1].timeout(10000).emitWithAck('audio-room:seat-force-mute',{roomId:room.roomId,userId:vip.publicId,muted:true});
 assert.equal(muted.error?.code,'VIP_PROTECTED',JSON.stringify(muted));
 const follow=await request(`/api/v1/users/${vip.publicId}/follow`,2,{method:'POST'});assert.equal(follow.status,403,JSON.stringify(follow));assert.equal(follow.error.code,'FOLLOW_FORBIDDEN');
 const {assertVipModeration}=await import('../src/lib/vip-capabilities.js');await assertVipModeration(db,room,owner.id,vip.id,'ANTI_KICK');
 // Owner-controlled display: exercise real persistence, fan-out and reconnect snapshots.
 const displayEvents=sockets.map(()=>[]);
 sockets.forEach((socket,i)=>socket.on('audio-room:settings-changed',event=>displayEvents[i].push(event.data)));
 const beforeDisplay=await db.audioRoom.findUnique({where:{id:room.id}});
 assert.equal(beforeDisplay.showHeaderAndTrophy,true,'Existing/new rooms must start visible');
 const patchDisplay=(actor,body)=>request(path,actor,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 for(const actor of [1,2]){
  const rejected=await patchDisplay(actor,{showHeaderAndTrophy:false});
  assert.equal(rejected.status,403,JSON.stringify(rejected));assert.equal(rejected.error.code,'ROOM_OWNER_REQUIRED');
 }
 for(const value of [null,'false',0,[],{}])assert.equal((await patchDisplay(0,{showHeaderAndTrophy:value})).status,422);
 const hidden=await patchDisplay(0,{showHeaderAndTrophy:false});assert.equal(hidden.status,200,JSON.stringify(hidden));
 assert.equal(hidden.data.room.showHeaderAndTrophy,false);
 const displayRevision=hidden.data.room.settingsRevision;assert.equal(displayRevision,beforeDisplay.settingsRevision+1);
 await delay(350);
 for(const events of displayEvents)assert(events.some(e=>e.roomId===room.roomId&&e.showHeaderAndTrophy===false&&e.settingsRevision===displayRevision),'A room member missed the visibility broadcast');
 const renamed=await patchDisplay(0,{title:'Private display verification'});
 assert.equal(renamed.data.room.showHeaderAndTrophy,false);assert.equal(renamed.data.room.settingsRevision,displayRevision);
 const stored=await db.audioRoom.findUnique({where:{id:room.id}});
 for(const key of ['privacyMode','paidEntryCoins','passwordHash','giftInteractions','seatLayout','seatRevision','chatLocked','joiningDisabled','bannerRevision'])assert.deepEqual(stored[key],beforeDisplay[key],`Display changed unrelated ${key}`);
 sockets[2].disconnect();await delay(350);
 const rejoined=await joined(2,password);
 assert.equal(rejoined.data.showHeaderAndTrophy,false);assert.equal(rejoined.data.settingsRevision,displayRevision);
 const shown=await patchDisplay(0,{showHeaderAndTrophy:true});assert.equal(shown.data.room.showHeaderAndTrophy,true);assert.equal(shown.data.room.settingsRevision,displayRevision+1);
 console.log('PASS real HTTP/socket: owner-only header/trophy setting persisted, invalid inputs rejected, all four clients received it, reconnect retained it, unrelated settings unchanged.');

 // Host Center: private zero-balance fixtures, including an owner who is not a member.
 agency=await db.agency.create({data:{publicId:`AGN-HOSTQA-${run}`,name:'Private Host Center QA',ownerUserId:owner.id,status:'ACTIVE'}});
 await db.user.update({where:{id:owner.id},data:{appRoles:['HOST']}});
 assert.equal((await db.user.findUnique({where:{id:owner.id}})).agencyId,null);
 await db.user.update({where:{id:observer.id},data:{appRoles:['HOST'],agencyId:agency.id}});
 await db.audioRoomSeat.updateMany({where:{audioRoomId:room.id,occupantUserId:{in:[owner.id,observer.id]}},data:{occupantUserId:null,occupiedAt:null}});
 const thirtyMinutesAgo=new Date(Date.now()-30*60000);
 await db.audioRoomSeat.update({where:{audioRoomId_seatId:{audioRoomId:room.id,seatId:'row0-seat3'}},data:{occupantUserId:owner.id,occupiedAt:thirtyMinutesAgo,isMuted:true}});
 await db.audioRoomSeat.update({where:{audioRoomId_seatId:{audioRoomId:room.id,seatId:'row0-seat2'}},data:{occupantUserId:observer.id,occupiedAt:thirtyMinutesAgo,isMuted:false}});
 await db.$executeRaw`SELECT refresh_audio_mic_attendance(${room.id}, ${users.map(u=>u.id)}::text[], ${new Date()}::timestamp)`;
 const month=new Date().toISOString().slice(0,7);
 for(const actor of [0,2]){
  const report=await request(`/api/v1/me/host-center?month=${month}`,actor);
  assert.equal(report.status,200,JSON.stringify(report));assert.equal(report.data.agency.publicId,agency.publicId);
  assert.equal(report.data.attendance.liveMinutes,30);assert.equal(report.data.attendance.activeDays,1);
  assert.equal(report.data.hostSince.slice(0,7),month);
  const prior=new Date(`${month}-01T00:00:00Z`);prior.setUTCMonth(prior.getUTCMonth()-1);
  const rejected=await request(`/api/v1/me/host-center?month=${prior.toISOString().slice(0,7)}`,actor);assert.equal(rejected.status,422);assert.equal(rejected.error.code,'HOST_MONTH_BEFORE_START');
 }
 await db.audioRoomSeat.updateMany({where:{audioRoomId:room.id,occupantUserId:{in:[owner.id,observer.id]}},data:{occupantUserId:null,occupiedAt:null}});
 for(const actor of [0,2]){
  const afterLeaving=await request(`/api/v1/me/host-center?month=${month}`,actor);
  assert.equal(afterLeaving.status,200);assert.equal(afterLeaving.data.attendance.liveMinutes,30);
 }
 assert.equal((await request(`/api/v1/me/host-center?month=${month}`,1)).status,403,'Non-HOST should remain forbidden');
 await db.agency.update({where:{id:agency.id},data:{status:'INACTIVE'}});
 assert.equal((await request(`/api/v1/me/host-center?month=${month}`,0)).status,403,'Inactive owned agency should not authorize Host Center');
 console.log('PASS real HTTP host start boundary: hostSince returned as ISO date; the preceding month rejected with HTTP 422.');
 console.log('PASS real HTTP Host Center contract: 30-minute audio mic fixtures report 30 minutes/1 day before and after unseating; HOST agency owner without membership returns 200; non-HOST/inactive-agency access stays forbidden.');
 console.log('PASS real HTTP/socket: admin kick and ban rejected VIP_PROTECTED; force-mute rejected; membership intact.');
 console.log('PASS real HTTP/socket: invisible VIP joins password room without password; no entrance/public member event; member API hides identity from listener and exposes it to admin.');
 console.log('PASS real HTTP: FOLLOW_FORBIDDEN; priority member order; owner override policy; locked-seat VIP bypass and non-VIP GIF rejection.');
}finally{
 for(const socket of sockets)socket?.disconnect();
 if(server){server.kill('SIGTERM');await delay(500);if(server.exitCode===null)server.kill('SIGKILL');}else await delay(500);
 if(db){
  if(room)await db.audioRoom.deleteMany({where:{id:room.id}});
  if(agency)await db.agency.deleteMany({where:{id:agency.id}});
  if(users.length)await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
  if(tier)await db.vipTier.deleteMany({where:{id:tier.id}});
  await db.$disconnect();
 }
 if(logFd!==undefined)closeSync(logFd);
 if(admin){if(created)await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);await admin.end();}
 console.log('QA fixtures cleaned up. No existing user balances or memberships changed.');
}
