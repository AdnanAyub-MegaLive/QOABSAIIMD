import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
dotenv.config({path:'.env.local',quiet:true});
process.env.MOBILE_SESSION_TTL_SECONDS='600';
const {prisma:p}=await import('../src/lib/prisma.js');
const {default:mobile}=await import('../src/lib/mobile-session.cjs');
const {ensureGames,saveGame,serializeGame}=await import('../src/lib/game-control/service.js');
const origin='https://portal.megachat.live',users=[],sockets=[],restore=[];
const run=randomUUID().slice(0,8);let room;
const log=(name,details={})=>console.log(JSON.stringify({name,...details}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(token){
 const ws=new WebSocket('wss://portal.megachat.live/socket.io/?EIO=4&transport=websocket');
 let ackResolve;const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket connect timeout')),20000);ws.addEventListener('error',()=>reject(Error('Socket connect failed')));ws.addEventListener('message',event=>{const msg=String(event.data);if(msg[0]==='0')ws.send('40'+JSON.stringify({token}));else if(msg==='2')ws.send('3');else if(msg.startsWith('40')){clearTimeout(timer);resolve();}else if(msg.startsWith('431'))ackResolve?.(JSON.parse(msg.slice(3))[0]);else if(msg.startsWith('44'))reject(Error('Socket authentication failed'));});});
 await ready;return{disconnect:()=>ws.close(),join:roomId=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket room join timeout')),25000);ackResolve=value=>{clearTimeout(timer);resolve(value);};ws.send('421'+JSON.stringify(['audio-room:join',{roomId}]));})};
}
async function post(body,cookie='',expected=200){
 const r=await fetch(`${origin}/api/games/player`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function snapshot(gameId,cookie){return (await post({action:'shared-state',gameId},cookie)).data;}
try{
 await ensureGames();
 for(const id of ['teen-patti','pizza']){
  const row=await p.gameDefinition.findUniqueOrThrow({where:{id}});restore.push(serializeGame(row));
  await saveGame({...serializeGame(row),status:'active'},'Authorized production game QA');
 }
 log('Games temporarily enabled');
 for(let i=0;i<2;i++)users.push(await p.user.create({data:{publicId:`USR-QA-${run}-${i}`,name:`QA shared games ${run} ${i}`,coinBalance:0n}}));
 room=await p.audioRoom.create({data:{roomId:`ROOM-QA-${run}`,ownerId:users[0].id,title:`QA shared games ${run}`,privacyMode:'HIDDEN',status:'LIVE'}});
 const cookies=[];
 for(const u of users){
  const token=mobile.createMobileSessionToken(u),socket=await connect(token);sockets.push(socket);
  const joined=await socket.join(room.roomId);
  assert.equal(joined.success,true,JSON.stringify(joined.error));
  cookies.push((await post({action:'launch',token,roomId:room.roomId})).cookie);
 }
 log('Two dedicated accounts joined hidden room',{roomId:room.roomId,accounts:users.map(u=>u.publicId)});
 for(const gameId of ['teen-patti','pizza']){
  let a=await snapshot(gameId,cookies[0]);
  if(a.closesAt-Date.now()<12000){await wait(Math.max(0,a.endsAt-Date.now()+500));a=await snapshot(gameId,cookies[0]);}
  const b=await snapshot(gameId,cookies[1]);assert.equal(a.slot,b.slot);assert.equal(a.closesAt,b.closesAt);assert.equal(a.outcome,null);
  const choices=gameId==='teen-patti'?['1','2']:['tomato','steak'];
  const req={action:'shared-enter',id:randomUUID(),gameId,dayId:a.dayId,slot:a.slot,amount:100,choice:choices[0]};
  const first=(await post(req,cookies[0])).data;
  assert.deepEqual((await post(req,cookies[0])).data,first);
  await post({...req,amount:101},cookies[0],409);
  await post({...req,id:randomUUID(),choice:choices[1],amount:200},cookies[0]);
  await post({...req,id:randomUUID(),amount:100},cookies[0]);
  await post({...req,id:randomUUID(),amount:100},cookies[1]);
  await post({...req,id:randomUUID(),amount:Number(a.availablePoints)+1},cookies[0],409);
  const placed=await snapshot(gameId,cookies[0]);
  assert.equal(placed.myTotal,'400');assert.equal(placed.mineEntries.length,3);assert.equal(placed.participants,2);assert.equal(placed.totalPoints,'500');
  assert.equal(BigInt(placed.availablePoints),BigInt(a.availablePoints)-400n);
  log(`${gameId}: shared countdown, multiple choices, repeated option, retry/conflict and overspend PASS`,{round:placed.roundNumber,totals:placed.myTotals});
  await wait(Math.max(0,a.closesAt-Date.now()+300));
  await post({...req,id:randomUUID()},cookies[0],409);
  await wait(Math.max(0,a.revealsAt-Date.now()+2600));
  // Inspect the live worker's settlement before a state request can settle it on demand.
  const rows=await p.sharedGameEntry.findMany({where:{dayId:a.dayId,slot:a.slot,roomId:room.roomId,userId:users[0].id}});
  assert.equal(rows.length,3);assert.ok(rows.every(e=>e.status==='SETTLED'));
  const result=await snapshot(gameId,cookies[0]),other=await snapshot(gameId,cookies[1]);
  assert.deepEqual(result.outcome,other.outcome);
  const payout=rows.reduce((n,e)=>n+BigInt(e.result.payout),0n);
  assert.equal(BigInt(result.availablePoints),BigInt(a.availablePoints)-400n+payout);
  assert.equal((await snapshot(gameId,cookies[0])).availablePoints,result.availablePoints);
  log(`${gameId}: deadline, automatic worker settlement, shared reveal and no double-credit PASS`,{outcome:result.outcome,payout:String(payout)});
  await wait(Math.max(0,a.endsAt-Date.now()+500));
  const empty=await snapshot(gameId,cookies[0]);assert.equal(empty.participants,0);assert.equal(empty.outcome,null);assert.ok(empty.roundNumber>a.roundNumber);
  await wait(Math.max(0,empty.endsAt-Date.now()+500));
  const advanced=await snapshot(gameId,cookies[0]);assert.ok(advanced.roundNumber>empty.roundNumber);assert.ok(advanced.history.some(h=>h.roundNumber===empty.roundNumber));
  log(`${gameId}: unattended empty round advanced and generated a result PASS`);
 }
 const balances=await p.user.findMany({where:{id:{in:users.map(u=>u.id)}},select:{coinBalance:true,hostSalaryCoinBalance:true}});
 assert.ok(balances.every(u=>u.coinBalance===0n&&u.hostSalaryCoinBalance===0n));
 assert.equal(await p.walletTransaction.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
 log('Wallet isolation PASS: zero Coins, Diamonds and wallet ledger entries for test users');
}catch(error){console.error('QA FAILED',error.message);process.exitCode=1;}
finally{
 for(const prior of restore){const row=await p.gameDefinition.findUnique({where:{id:prior.id}});await saveGame({...prior,revision:row.revision},'Restore settings after authorized production game QA');}
 log('Teen Patti and Pizza restored to original paused settings');
 for(const s of sockets)s.disconnect();await wait(1000);
 const ids=users.map(u=>u.id);
 if(ids.length){
  await p.sharedGameEntry.deleteMany({where:{userId:{in:ids}}});
  await p.gamePlayerSession.deleteMany({where:{userId:{in:ids}}});
  if(room)await p.audioRoom.delete({where:{id:room.id}});
  for(const u of users)await p.user.delete({where:{id:u.id}});
 }
 log('Dedicated test users, room, point balances, entries and game sessions removed');
 await p.$disconnect();
}
