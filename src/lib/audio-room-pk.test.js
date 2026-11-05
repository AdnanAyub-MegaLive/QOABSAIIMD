import { expect, it, vi, afterEach } from 'vitest';
import { readPk, matchmaking, invitePk, respondPk, pkDto, pkTransition } from './audio-room-pk.js';
vi.mock('./realtime.js', () => ({ emitToAudioRoom: vi.fn() }));
import { emitToAudioRoom } from './realtime.js';
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
function fixture() {
 const rooms = ['A','B','C'].map(x => ({ id:x,roomId:`ROOM-${x}`,ownerId:`u${x}`,title:`Room ${x}`,status:'LIVE',privacyMode:'PUBLIC',isBlocked:false,coverImageUrl:null }));
 const searches=[], battles=[]; let tail=Promise.resolve();
 const matches=(s,w)=>Object.entries(w).every(([k,v])=> k==='ownerId_requestKey' ? s.ownerId===v.ownerId&&s.requestKey===v.requestKey : v && typeof v==='object' ? ('in' in v ? v.in.includes(s[k]) : 'not' in v ? s[k]!==v.not : 'lte' in v ? s[k]<=v.lte : 'gt' in v ? s[k]>v.gt : true) : s[k]===v);
 const tx={
  $queryRaw:async()=>[],
  audioRoom:{findUnique:async({where})=>rooms.find(r=>r.roomId===where.roomId)},
  audioRoomMember:{findUnique:async()=>({socketCount:1})},audioRoomBan:{findFirst:async()=>null},user:{findUnique:async()=>({status:'ACTIVE'})},userBlock:{findFirst:async()=>null},
  audioRoomPkSearch:{
   findUnique:async({where})=>searches.find(s=>matches(s,where)),
   findFirst:async({where,orderBy})=>{const rows=searches.filter(s=>matches(s,where));return orderBy?rows.at(-1):rows[0]},
   findMany:async({where,take})=>searches.filter(s=>matches(s,where)).slice(0,take),
   create:async({data})=>{const s={id:`Q-${searches.length}`,status:'WAITING',createdAt:new Date(),...data};searches.push(s);return {...s}},
   update:async({where,data})=>{const s=searches.find(s=>s.id===where.id);Object.assign(s,data);return {...s}},
   updateMany:async({where,data})=>{for(const s of searches.filter(s=>matches(s,where)))Object.assign(s,data)},
  },
  audioRoomPkSession:{
   findMany:async({where})=>battles.filter(b=>matches(b,where)).map(b=>({...b})),
   updateMany:async({where,data})=>{const rows=battles.filter(b=>matches(b,where));for(const b of rows)Object.assign(b,{...data,revision:b.revision+1});return {count:rows.length}},
   findFirst:async({where,orderBy})=>{const rows=battles.filter(b=>(!where.status||where.status.in.includes(b.status))&&where.OR.some(w=>Object.entries(w).some(([k,v])=>typeof v==='object'?v.in.includes(b[k]):v===b[k])));return orderBy?rows.at(-1):rows[0]},
   findUnique:async({where})=>battles.find(b=>b.id===where.id),
   create:async({data})=>{const b={createdAt:new Date(),status:'PENDING',leftScore:0n,rightScore:0n,revision:0,...data,leftRoom:rooms.find(r=>r.id===data.leftRoomId),rightRoom:rooms.find(r=>r.id===data.rightRoomId)};battles.push(b);return b},
   update:async({where,data})=>{const b=battles.find(b=>b.id===where.id);Object.assign(b,{...data,revision:b.revision+1});return b},
  }
 };
 const db={$transaction:fn=>{const p=tail.then(()=>fn(tx));tail=p.catch(()=>{});return p}};
 return {db,tx,rooms,searches,battles};
}
it('search recovery, duplicate POST, matching and cancel race preserve one battle',async()=>{
 const f=fixture();
 expect((await matchmaking(f.db,'uA','ROOM-A','GET')).search).toBeUndefined();
 const a=await matchmaking(f.db,'uA','ROOM-A','POST','request-a');
 expect(a.search.status).toBe('WAITING');
 expect((await matchmaking(f.db,'uA','ROOM-A','POST','request-a')).search.id).toBe(a.search.id);
 await matchmaking(f.db,'uB','ROOM-B','POST','request-b');
 expect(f.battles).toHaveLength(1);
 const cancelled=await matchmaking(f.db,'uA','ROOM-A','DELETE','request-a',a.search.id);
 expect(cancelled.search.status).toBe('MATCHED');expect(cancelled.pk.leftRoomId).toBe('A');
 expect((await matchmaking(f.db,'uA','ROOM-A','GET')).pk.id).toBe(cancelled.pk.id);
});
it('cancelled key never rejoins and mismatched queue ID is rejected',async()=>{
 const f=fixture(),a=await matchmaking(f.db,'uA','ROOM-A','POST','request-a');
 await expect(matchmaking(f.db,'uA','ROOM-A','DELETE','request-a','wrong')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 await matchmaking(f.db,'uA','ROOM-A','DELETE','request-a',a.search.id);
 expect((await matchmaking(f.db,'uA','ROOM-A','POST','request-a')).search.status).toBe('CANCELLED');
});
it('simultaneous joins and direct invites cannot place a room in two battles',async()=>{
 const f=fixture();await matchmaking(f.db,'uA','ROOM-A','POST','request-a');
 await Promise.allSettled([matchmaking(f.db,'uB','ROOM-B','POST','request-b'),invitePk(f.db,'uC','ROOM-C','ROOM-A')]);
 expect(f.battles).toHaveLength(1);
});
it('rejects nonowners, blocked pairs and disconnected owners',async()=>{
 const f=fixture();await expect(matchmaking(f.db,'other','ROOM-A','POST','request-a')).rejects.toMatchObject({code:'ROOM_OWNER_REQUIRED'});
 f.tx.userBlock.findFirst=async()=>({});
 await expect(invitePk(f.db,'uA','ROOM-A','ROOM-B')).rejects.toMatchObject({code:'ROOM_UNAVAILABLE'});
 f.tx.audioRoomMember.findUnique=async()=>({socketCount:0});
 await expect(matchmaking(f.db,'uA','ROOM-A','POST','request-a')).rejects.toMatchObject({code:'ROOM_MEMBERSHIP_REQUIRED'});
});
it('expired searches cannot be revived by replay',async()=>{
 const f=fixture();await matchmaking(f.db,'uA','ROOM-A','POST','request-a');f.searches[0].expiresAt=new Date(0);
 expect((await matchmaking(f.db,'uA','ROOM-A','POST','request-a')).search.status).toBe('EXPIRED');
});
it('only invited owner accepts; repeat accept preserves five-minute timer',async()=>{
 const f=fixture(),{pk}=await invitePk(f.db,'uA','ROOM-A','ROOM-B');
 await expect(respondPk(f.db,'uA','ROOM-A',pk.id,'ACCEPT')).rejects.toMatchObject({code:'PK_STATE_INVALID'});
 const accepted=await respondPk(f.db,'uB','ROOM-B',pk.id,'ACCEPT');
 expect(+accepted.pk.endsAt-accepted.pk.startedAt).toBe(300000);
 expect((await respondPk(f.db,'uB','ROOM-B',pk.id,'ACCEPT')).changed).toBe(false);
});
it('exact large scores, public metadata and deterministic winner',()=>{
 const f=fixture(),p={id:'p',status:'LIVE',leftRoomId:'A',rightRoomId:'B',leftRoom:f.rooms[0],rightRoom:f.rooms[1],leftScore:9007199254740999n,rightScore:9007199254740998n,revision:1};
 expect(pkTransition(p,'A','END').winnerRoomId).toBe('ROOM-A');
 const dto=pkDto(p,'https://portal.test');expect(dto.leftScore).toBe('9007199254740999');expect(dto.leftRoom).toEqual({roomId:'ROOM-A',title:'Room A',coverImageUrl:null});
 expect(JSON.stringify(dto)).not.toContain('uA');
});

it('queue migration is isolated and enforces unique owner request IDs',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const {readFile}=await import('node:fs/promises');const db=new PGlite();
 try {
  await db.exec(await readFile(new URL('../../prisma/migrations/20261103200000_audio_pk_search/migration.sql',import.meta.url),'utf8'));
  await db.exec(`INSERT INTO "AudioRoomPkSearch" (id,"roomId","ownerId","requestKey","expiresAt") VALUES ('q','r','u','key','2026-12-01')`);
  await expect(db.exec(`INSERT INTO "AudioRoomPkSearch" (id,"roomId","ownerId","requestKey","expiresAt") VALUES ('q2','r','u','key','2026-12-01')`)).rejects.toMatchObject({code:'23505'});
 } finally {await db.close()}
},30000);

it('GET expires an invitation at five seconds and emits once to both rooms',async()=>{
 vi.useFakeTimers(); const f=fixture();
 const {pk}=await invitePk(f.db,'uA','ROOM-A','ROOM-B');
 vi.advanceTimersByTime(4999);
 expect((await readPk(f.db,'uA','ROOM-A')).status).toBe('PENDING');
 expect(emitToAudioRoom).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1);
 const expired=await readPk(f.db,'uB','ROOM-B');
 expect(expired).toMatchObject({status:'REJECTED',revision:1,endedAt:new Date()});
 await readPk(f.db,'uA','ROOM-A');
 expect(emitToAudioRoom).toHaveBeenCalledTimes(2);
 for(const room of ['ROOM-A','ROOM-B'])expect(emitToAudioRoom).toHaveBeenCalledWith(room,'audio-room:pk-changed',expect.objectContaining({data:expect.objectContaining({id:pk.id,status:'REJECTED',revision:1})}));
});
it('stale direct invites free both rooms for a new invitation',async()=>{
 vi.useFakeTimers(); const f=fixture();
 await invitePk(f.db,'uA','ROOM-A','ROOM-B');vi.advanceTimersByTime(5001);
 const next=await invitePk(f.db,'uC','ROOM-C','ROOM-A');
 expect(next.changed).toBe(true);
 expect(f.battles.map(b=>b.status)).toEqual(['REJECTED','PENDING']);
});
it('late acceptance and concurrent reads cannot revive or reject twice',async()=>{
 vi.useFakeTimers();const f=fixture();const {pk}=await invitePk(f.db,'uA','ROOM-A','ROOM-B');
 vi.advanceTimersByTime(5001);
 const [response]=await Promise.all([respondPk(f.db,'uB','ROOM-B',pk.id,'ACCEPT'),readPk(f.db,'uA','ROOM-A')]);
 expect(response.pk.status).toBe('REJECTED');expect(response.changed).toBe(false);
 expect(response.pk.revision).toBe(1);expect(emitToAudioRoom).toHaveBeenCalledTimes(2);
});
it('matched queue recovery expires pending invitations and allows a fresh search',async()=>{
 vi.useFakeTimers();const f=fixture();
 await matchmaking(f.db,'uA','ROOM-A','POST','request-a');
 await matchmaking(f.db,'uB','ROOM-B','POST','request-b');vi.advanceTimersByTime(5001);
 expect((await matchmaking(f.db,'uA','ROOM-A','GET')).search).toBeNull();
 expect((await matchmaking(f.db,'uA','ROOM-A','POST','request-new')).search.status).toBe('WAITING');
});
it('accepted battles remain live after the invitation timeout',async()=>{
 vi.useFakeTimers();const f=fixture();const {pk}=await invitePk(f.db,'uA','ROOM-A','ROOM-B');
 await respondPk(f.db,'uB','ROOM-B',pk.id,'ACCEPT');vi.advanceTimersByTime(6000);
 expect((await readPk(f.db,'uA','ROOM-A')).status).toBe('LIVE');
 expect(emitToAudioRoom).not.toHaveBeenCalled();
});
