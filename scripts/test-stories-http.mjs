// Disposable localhost database + production Next build. No production records or CDN writes.
import {config} from 'dotenv';
import {Client} from 'pg';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import sharp from 'sharp';
config({path:'.env.local',quiet:true});
const base=new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1','::1'].includes(base.hostname),'Local database required');
const name=`megalive_story_test_${randomUUID().replaceAll('-','')}`;
base.pathname='/postgres';const admin=new Client({connectionString:base.href});await admin.connect();
const dir=await mkdtemp(join(tmpdir(),'megalive-story-http-'));
let db,server,logFd,created=false;
try{
 await admin.query(`CREATE DATABASE "${name}"`);created=true;base.pathname=`/${name}`;
 process.env.DATABASE_URL=base.href;process.env.AUTH_SECRET=randomBytes(48).toString('hex');
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`;Object.assign(process.env,{AUTH_URL:origin,MOBILE_API_BASE_URL:origin,MOBILE_APP_ORIGIN:origin,AUTH_TRUST_HOST:'true'});
 const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema','prisma/schema.prisma','--script'],{encoding:'utf8'});
 const setup=new Client({connectionString:base.href});await setup.connect();await setup.query(sql);await setup.end();
 ({prisma:db}=await import('../src/lib/prisma.js'));const {default:mobile}=await import('../src/lib/mobile-session.cjs');
 const users=await Promise.all(['A','B','C'].map(publicId=>db.user.create({data:{publicId:`QA-STORY-${publicId}`,name:publicId,country:'PK'}})));
 const [a,b,c]=users,tokens=users.map(u=>mobile.createMobileSessionToken(u));
 await db.userFollow.createMany({data:[{followerId:a.id,followedId:b.id},{followerId:b.id,followedId:a.id}]});
 logFd=openSync(join(dir,'server.log'),'w');server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:process.env,stdio:['ignore',logFd,logFd]});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`${origin}/api/health`,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,300));}assert(ready,'Server unavailable');
 const request=(path,actor=0,options={})=>fetch(new URL(path,origin),{...options,headers:{...(actor===null?{}:{Authorization:`Bearer ${tokens[actor]}`}),...options.headers},signal:AbortSignal.timeout(30000)});
 const json=async(res,status=200)=>{const value=await res.json();assert.equal(res.status,status,JSON.stringify(value));return value.data;};
 const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const upload=(caption,audience='PUBLIC',picture=null)=>{const form=new FormData();form.set('caption',caption);form.set('audience',audience);form.set('requestId',randomUUID());if(picture)form.set('media',new File([picture],'test.png',{type:'image/png'}));return request('/api/stories',0,{method:'POST',body:form});};
 await json(await request('/api/stories',null),401);
 const picture=await sharp({create:{width:16,height:16,channels:3,background:'#8833cc'}}).png().toBuffer();
 const story=await json(await upload('Hello','FOLLOWERS',picture),201);assert.equal(story.status,'PENDING');
 assert.equal((await json(await request('/api/stories',1))).groups.length,0);
 await json(await request(`/api/stories/${story.id}`,1),404);
 await db.story.update({where:{publicId:story.id},data:{status:'APPROVED'}});
 const feed=await json(await request('/api/stories',1));assert.equal(feed.groups[0].stories[0].id,story.id);
 assert.equal((await request(story.mediaUrl,1)).status,200);await json(await request(story.mediaUrl,2),404);
 await json(await request(`/api/stories/${story.id}/view`,1,post({})));await json(await request(`/api/stories/${story.id}/view`,1,post({})));
 assert.equal((await json(await request(`/api/stories/${story.id}/viewers`,0))).viewers.length,1);await json(await request(`/api/stories/${story.id}/viewers`,1),404);
 const reply={body:'❤️',clientMessageId:randomUUID()};const first=await json(await request(`/api/stories/${story.id}/reply`,1,post(reply)));const retry=await json(await request(`/api/stories/${story.id}/reply`,1,post(reply)));assert.equal(first.message.id,retry.message.id);assert.equal(first.message.type,'story_reply');
 await json(await request(`/api/stories/${story.id}/report`,1,post({reason:'Test report'})));assert.equal(await db.storyReport.count(),1);
 await json(await request(`/api/stories/${story.id}`,1,{method:'DELETE'}),404);
 await json(await request(`/api/stories/${story.id}`,0,{method:'DELETE'}));await json(await request(story.mediaUrl,1),404);
 const history=await json(await request(`/api/v1/conversations/${first.conversationId}/messages`,1));assert.equal(history.messages.find(m=>m.id===first.message.id).story.available,false);
 console.log('PASS Stories HTTP: authentication, upload, pending moderation, follower visibility, protected media, unique views, owner-only viewers/delete, replay-safe replies, reporting and removed-card hydration.');
 const room=await db.audioRoom.create({data:{roomId:'QA-STORY-ROOM',ownerId:a.id,title:'Room share test',status:'LIVE'}});
 const payload={roomId:room.roomId,body:'',clientMessageId:randomUUID()};const path=`/api/v1/conversations/${first.conversationId}/messages`;
 const sent=await json(await request(path,1,post(payload)),201);const sentAgain=await json(await request(path,1,post(payload)),201);assert.equal(sent.message.id,sentAgain.message.id);assert.equal(sent.message.room.open,true);
 await db.audioRoom.update({where:{id:room.id},data:{status:'ENDED'}});const closed=await json(await request(path,1));assert.equal(closed.messages.find(m=>m.id===sent.message.id).room.open,false);
 await db.audioRoom.update({where:{id:room.id},data:{status:'LIVE',passwordHash:'locked'}});await json(await request(path,1,post({...payload,clientMessageId:randomUUID()})),403);
 console.log('PASS Room share HTTP: room-card send, idempotent retry, current closed state and locked-room rejection.');
}finally{
 if(server){server.kill('SIGTERM');await new Promise(r=>{server.once('exit',r);setTimeout(r,5000).unref();});}
 if(logFd!==undefined)closeSync(logFd);
 if(db){const {deleteStoryMedia}=await import('../src/lib/stories.js');for(const row of await db.storyMediaObject.findMany())await deleteStoryMedia(row.key);await db.$disconnect();}
 if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();console.log(`Local test log: ${join(dir,'server.log')}`);
}
