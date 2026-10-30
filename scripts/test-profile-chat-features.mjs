// Real HTTP + PostgreSQL + private object-storage smoke test.
// Creates a disposable database and private test objects; never modifies application records.
import {config} from 'dotenv';
import {Client} from 'pg';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import sharp from 'sharp';
config({path:'.env.local',quiet:true});
if(process.env.FEATURE_SMOKE_STORAGE!=='1')throw Error('Set FEATURE_SMOKE_STORAGE=1 to authorize disposable private storage fixtures.');
const databaseName=`megalive_feature_test_${randomUUID().replaceAll('-','')}`;
const base=new URL(process.env.DATABASE_URL);base.pathname='/postgres';
const admin=new Client({connectionString:base.href});await admin.connect();
const dir=await mkdtemp(join(tmpdir(),'megalive-feature-smoke-'));
let db,server,logFd,created=false,cleanupFailed=false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await admin.query(`CREATE DATABASE "${databaseName}"`);created=true;base.pathname=`/${databaseName}`;
 process.env.DATABASE_URL=base.href;process.env.AUTH_SECRET=randomBytes(48).toString('hex');
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`;
 Object.assign(process.env,{AUTH_URL:origin,MOBILE_API_BASE_URL:origin,MOBILE_APP_ORIGIN:origin,AUTH_TRUST_HOST:'true'});
 const push=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','push'],{env:process.env,encoding:'utf8'});
 assert.equal(push.status,0,'Disposable database schema creation failed');
 ({prisma:db}=await import('../src/lib/prisma.js'));
 const {default:mobile}=await import('../src/lib/mobile-session.cjs');
 const users=await Promise.all(['owner','member','outsider'].map(name=>db.user.create({data:{publicId:`USR-SMOKE-${name}`,name:`Smoke ${name}`,country:'PK',profileImage:'avatar:cat'}})));
 const [owner,member,outsider]=users,tokens=users.map(u=>mobile.createMobileSessionToken(u));
 const group=await db.conversation.create({data:{publicId:'CONV-SMOKE',name:'Smoke group',kind:'GROUP',createdById:owner.id,participants:{create:users.slice(0,2).map((u,i)=>({userId:u.id,role:i?'MEMBER':'OWNER'}))}}});
 const picture=await sharp({create:{width:80,height:60,channels:3,background:'#9a34e5'}}).png().toBuffer();
 const frame=await db.uploadAsset.create({data:{publicId:'AST-SMOKE-FRAME',name:'Smoke frame',category:'FRAMES',fileName:'frame.png',fileData:picture,fileSize:picture.length,mimeType:'image/png',isGlobal:false,assignments:{create:{userId:member.id}}}});
 await db.userEquippedProp.create({data:{userId:member.id,category:'FRAMES',assetId:frame.id}});
 logFd=openSync(join(dir,'server.log'),'w');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:process.env,stdio:['ignore',logFd,logFd]});
 let ready=false;for(let i=0;i<120;i++){if(server.exitCode!==null)throw Error('Smoke server exited');try{if((await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await delay(250);}assert(ready,'Smoke server did not become ready');
 const request=(path,actor=0,options={})=>fetch(new URL(path,origin),{...options,headers:{...(actor===null?{}:{Authorization:`Bearer ${tokens[actor]}`}),...options.headers},signal:AbortSignal.timeout(120000)});
 const expectStatus=async(res,status)=>{assert.equal(res.status,status,`${new URL(res.url).pathname}: ${await res.clone().text()}`);return res;};
 const json=async(res,status=200)=>(await expectStatus(res,status)).json();
 const upload=(path,field,bytes,mime,actor=0,extras={},headers={})=>{const form=new FormData();form.set(field,new File([bytes],'fixture',{type:mime}));for(const [key,value]of Object.entries(extras))form.set(key,String(value));return request(path,actor,{method:'POST',body:form,headers});};
 await expectStatus(await upload('/api/v1/users/me/avatar','image',picture,'image/png',null),401);
 const gif=await sharp(Buffer.from([255,0,0,0,255,0]),{raw:{width:1,height:2,channels:3,pageHeight:1}}).gif({loop:0,delay:[100,100]}).toBuffer();
 for(const [bytes,mime,pages]of [[picture,'image/png',1],[await sharp(picture).jpeg().toBuffer(),'image/jpeg',1],[gif,'image/gif',2]]){
  const data=await json(await upload('/api/v1/users/me/avatar','image',bytes,mime),201);
  const image=await expectStatus(await request(data.data.profileImage,null),200),metadata=await sharp(Buffer.from(await image.arrayBuffer()),{animated:true}).metadata();
  assert.equal(metadata.format,'webp');assert.equal(metadata.pages??1,pages);assert.equal(metadata.exif,undefined);
  assert.equal((await db.user.findUnique({where:{id:owner.id}})).profileImage,data.data.profileImage);
 }
 await expectStatus(await upload('/api/v1/users/me/avatar','image',Buffer.from('bad'),'image/png'),422);
 await expectStatus(await upload('/api/v1/users/me/avatar','image',picture,'image/jpeg'),422);
 assert.equal((await db.user.findUnique({where:{id:outsider.id}})).profileImage,'avatar:cat');
 assert.equal(await db.uploadAsset.count({where:{category:'AVATARS',assignments:{some:{userId:owner.id}}}}),3);
 assert.equal(await db.userAvatarHistory.count({where:{userId:owner.id}}),3);
 console.log('PASS avatar: authenticated PNG/JPEG/animated GIF upload, real WebP download, ownership, history, invalid files.');
 const details=await json(await request(`/api/v1/conversations/${group.publicId}`,1));
 assert.equal(details.data.conversation.owner.publicId,owner.publicId);
 const memberDTO=details.data.conversation.participants.find(p=>p.id===member.publicId);assert(memberDTO.frameUrl);await expectStatus(await request(memberDTO.frameUrl,null),200);
 await expectStatus(await request(`/api/v1/conversations/${group.publicId}`,2),404);
 const edit={method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'smoke-edit-1'},body:JSON.stringify({name:'Updated smoke',description:'Verified description'})};
 await expectStatus(await request(`/api/v1/conversations/${group.publicId}`,1,edit),403);
 const changed=await json(await request(`/api/v1/conversations/${group.publicId}`,0,edit));assert.equal(changed.data.conversation.revision,1);
 assert.equal((await json(await request(`/api/v1/conversations/${group.publicId}`,0,edit))).data.conversation.revision,1);
 const icon=await json(await upload(`/api/v1/conversations/${group.publicId}/icon`,'image',picture,'image/png',0,{}, {'Idempotency-Key':'smoke-icon-1'}),201);
 const iconURL=icon.data.conversation.iconUrl;
 const iconResponse=await expectStatus(await request(iconURL,1),200);assert.equal(iconResponse.headers.get('cache-control'),'private, no-store');assert.equal((await sharp(Buffer.from(await iconResponse.arrayBuffer())).metadata()).format,'webp');
 await expectStatus(await request(iconURL,2),404);
 console.log('PASS groups: real member artwork and private icon, owner edits, idempotent replay, outsider/member restrictions.');
 const videoPath=join(dir,'sample.mp4'),voicePath=join(dir,'sample.m4a');
 execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x48:d=1','-c:v','libx264','-pix_fmt','yuv420p',videoPath]);
 execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','1','-ac','1','-c:a','aac',voicePath]);
 const video=await readFile(videoPath),voice=await readFile(voicePath),mediaPath=`/api/v1/conversations/${group.publicId}/media`;
 const videoData=(await json(await upload(mediaPath,'video',video,'video/mp4'),201)).data.media;
 assert.equal(videoData.width,64);assert.equal(videoData.height,48);assert.equal(videoData.durationMs,1000);
 const videoResponse=await expectStatus(await request(videoData.url),200);assert.equal(videoResponse.headers.get('cache-control'),'private, no-store');
 const downloaded=join(dir,'downloaded.mp4');await writeFile(downloaded,Buffer.from(await videoResponse.arrayBuffer()));execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-xerror','-i',downloaded,'-f','null','-']);
 const poster=await expectStatus(await request(videoData.posterUrl),200);assert.equal((await sharp(Buffer.from(await poster.arrayBuffer())).metadata()).format,'jpeg');
 await expectStatus(await request(videoData.url,1),404); // Unsent attachment is private to its uploader.
 await json(await request(`/api/v1/conversations/${group.publicId}/messages`,0,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientMessageId:'smoke-video-1',mediaId:videoData.id})}),201);
 await expectStatus(await request(videoData.url,1),200);await expectStatus(await request(videoData.url,2),404);
 await expectStatus(await request(videoData.url,1,{headers:{Range:'bytes=0-15'}}),206);
 await expectStatus(await upload(mediaPath,'video',Buffer.from('corrupt'),'video/mp4'),422);
 console.log('PASS video: upload, actual private storage, decoded download, JPEG poster, send-to-test-group, ranges, access restrictions.');
 const voiceRoute=`/api/v1/conversations/${group.publicId}/voice`;
 const voiceData=await json(await upload(voiceRoute,'audio',voice,'audio/mp4',0,{clientMessageId:'smoke-voice-1',durationMs:1000}),201);
 const voiceURL=`${voiceRoute}/${voiceData.data.message.id}`;
 const voiceResponse=await expectStatus(await request(voiceURL,1),200);assert.equal(voiceResponse.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(Buffer.from(await voiceResponse.arrayBuffer()),voice);await expectStatus(await request(voiceURL,2),404);
 const damaged=Buffer.from(voice),mdat=damaged.indexOf(Buffer.from('mdat'));assert(mdat>0);damaged.fill(255,mdat+4,Math.min(mdat+204,mdat-4+damaged.readUInt32BE(mdat-4)));
 await expectStatus(await upload(voiceRoute,'audio',damaged,'audio/mp4',0,{clientMessageId:'smoke-voice-bad',durationMs:1000}),422);
 await expectStatus(await upload(voiceRoute,'audio',voice,'audio/mp4',0,{clientMessageId:'smoke-duration-bad',durationMs:10000}),422);
 assert.equal(await db.message.count({where:{kind:'voice'}}),1);
 await db.conversationParticipant.delete({where:{conversationId_userId:{conversationId:group.id,userId:member.id}}});
 await expectStatus(await request(`/api/v1/conversations/${group.publicId}`,1),404);await expectStatus(await request(iconURL,1),404);await expectStatus(await request(videoData.url,1),404);await expectStatus(await request(voiceURL,1),404);
 console.log('PASS voice: real private upload/download, exact audio bytes, corrupt AAC/duration rejection, removed-member access revoked.');
 console.log('PASS all feature HTTP checks; only disposable users and database records used.');
}finally{
 if(server&&server.exitCode===null){const exited=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await Promise.race([exited,delay(5000)]);if(server.exitCode===null){server.kill('SIGKILL');await exited;}}
 if(logFd!==undefined)closeSync(logFd);
 if(db){
  const {privateChatObject}=await import('../src/lib/chat-media.js'),{voiceObject}=await import('../src/lib/voice-storage.js');
  const media=await db.chatMediaObject.findMany(),icons=await db.groupIcon.findMany(),voices=await db.voiceObject.findMany();
  const keys=[...media.flatMap(r=>[r.key,r.posterKey].filter(Boolean)),...icons.map(r=>r.key)];
  for(const key of keys)try{await privateChatObject('delete',key);}catch{cleanupFailed=true;}
  for(const row of voices)try{await voiceObject('delete',row.key);}catch{cleanupFailed=true;}
  await db.$disconnect();
 }
 if(created&&!cleanupFailed){await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);console.log('CLEANUP: test database, private objects and loopback server removed.');}
 await admin.end();
 if(cleanupFailed)throw Error(`Test object cleanup needs retry; retained isolated database ${databaseName}`);
 // Retain the small server log for diagnosis; it contains no credentials or session tokens.
 console.log(`Smoke server log: ${join(dir,'server.log')}`);
 await Promise.all(['sample.mp4','sample.m4a','downloaded.mp4'].map(name=>rm(join(dir,name),{force:true})));
}
