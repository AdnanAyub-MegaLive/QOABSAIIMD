import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
dotenv.config({path:'.env.local',quiet:true});
process.env.MOBILE_SESSION_TTL_SECONDS='300';
const {prisma:p}=await import('./src/lib/prisma.js');
const {default:mobile}=await import('./src/lib/mobile-session.cjs');
const {ensureGames,saveGame,serializeGame}=await import('./src/lib/game-control/service.js');
const {previewRound}=await import('./src/lib/game-control/shared-preview.js');
const origin='https://portal.megachat.live';
let user;
try {
 const horizon=new Date(Date.now()+300000);
 assert.equal(await p.ban.count({where:{revokedAt:null,expiresAt:{lte:horizon}}}),0,'Pending ban reconciliation: abort to protect existing records');
 assert.equal(await p.specialIdAssignment.count({where:{status:'ACTIVE',expiresAt:{lte:horizon}}}),0,'Pending special-ID reconciliation: abort');
 user=await p.user.create({data:{publicId:`USR-QA-${randomUUID().slice(0,8)}`,name:'QA session URL verification',coinBalance:0n}});
 const config=await p.progressionConfiguration.findFirst({orderBy:{version:'desc'},include:{levels:true}});
 const backgrounds=await p.levelTagBackground.findMany({where:{track:{in:['USER','CHARM']},asset:{active:true}},include:{asset:true}});
 for(const track of ['USER','CHARM']) {
  const level=config?.levels.find(l=>l.track===track&&backgrounds.some(b=>b.track===track&&b.level===l.level));
  if(level) await p.userProgress.create({data:{userId:user.id,track,configurationVersion:config.version,lifetimePoints:level.thresholdPoints,currentLevel:level.level}});
 }
 const token=mobile.createMobileSessionToken(user,{deviceId:'qa-session-url'});
 const r=await fetch(`${origin}/api/users/session/status?deviceId=qa-session-url`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
 const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.data.user.id,user.publicId);
 console.log(JSON.stringify({sessionStatus:r.status,profileIdentityCorrect:true,userLevel:body.data.user.userLevel,charmLevel:body.data.user.charmLevel}));
 for(const field of ['userLevelBackgroundUrl','charmLevelBackgroundUrl']) {
  const url=body.data.user[field];assert.ok(url,`${field} missing`);
  const media=await fetch(url,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(30000)});
  assert.ok(media.ok,`${field}: ${media.status}`);await media.body?.cancel();
  console.log(JSON.stringify({field,status:media.status,type:media.headers.get('content-type'),version:new URL(url).searchParams.get('v')}));
 }
 assert.equal(await p.walletTransaction.count({where:{userId:user.id}}),0);
 await ensureGames();
 for(const row of await p.gameDefinition.findMany()) {
  const saved=await saveGame({...serializeGame(row),status:'active'},'User-authorized enable all free-point games');
  const refreshed=await p.gameDefinition.findUniqueOrThrow({where:{id:row.id}});
  const state=previewRound('isolated-configuration-qa',refreshed,{action:'shared-state'});
  assert.equal(state.game.status,'active');assert.ok(state.closesAt<state.endsAt);assert.ok(state.history.length);
  console.log(JSON.stringify({game:row.id,status:saved.game.status,revision:saved.game.revision,engine:state.game.engine,roundDurationMs:state.endsAt-state.opensAt,historyResults:state.history.length}));
 }
} finally {
 if(user){await p.userProgress.deleteMany({where:{userId:user.id}});await p.user.delete({where:{id:user.id}});console.log('Dedicated test account removed');}
 await p.$disconnect();
}
