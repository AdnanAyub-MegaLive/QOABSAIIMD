import {expect,it,vi} from 'vitest';
import {vipCapabilities,assertVipModeration,usersVip,vipPriority} from './vip-capabilities.js';
import {validateVipTier} from './vip-contract.js';
import {guardRoomSocketAction} from './room-moderation-guard.js';
import {roomAccessCheck} from './room-access-check.js';
import {emitVipRoomPresence} from './vip-room-presence.js';
import {sortRankingEntries} from './rankings.js';
const now=new Date();
const membership=(privileges=['ANTI_KICK','ANTI_MIC_BAN','INVISIBLE_ENTRY','ROOM_ANTI_LOCK','LEVEL_BOOST','HIGHLIGHT_NAME'])=>({userId:'vip',startsAt:new Date(+now-1000),expiresAt:new Date(+now+60000),tier:{active:true,level:5,privileges,xpMultiplierBps:15000,nameColor:'#26052F'}});
const room={id:'r',roomId:'ROOM-1',ownerId:'owner',status:'LIVE',passwordHash:'hash'};
const fixture=(row=membership())=>({vipMembership:{findUnique:vi.fn(async()=>row)},audioRoom:{findUnique:async()=>room},audioRoomRole:{findUnique:async({where})=>where.audioRoomId_userId.userId==='admin'?{role:'ADMIN'}:null,findMany:async()=>[{userId:'admin'}]},audioRoomBan:{findFirst:async()=>null},user:{findUnique:async()=>({id:'vip'}),findMany:async()=>[{publicId:'USR-owner'},{publicId:'USR-admin'}]},audioRoomSeat:{findUnique:async()=>({occupantUserId:'vip'}),findMany:async()=>[{occupantUserId:'vip'}]}});
it('exposes only recognized capabilities of the selected active tier',()=>{
 expect(vipCapabilities(membership(['ANTI_KICK','ANTI_KICK','UNKNOWN']),now)).toMatchObject({vipPrivileges:['ANTI_KICK'],vipLevel:5,vipXpMultiplierBps:10000,vipNameColor:null});
 expect(vipCapabilities(membership(),now)).toMatchObject({vipXpMultiplierBps:15000,vipNameColor:'#26052F'});
});
it.each(['missing','expired','future','revoked','disabled'])('grants nothing for %s membership',condition=>{
 const row=membership();if(condition==='expired')row.expiresAt=now;if(condition==='future')row.startsAt=new Date(+now+1);if(condition==='revoked')row.revokedAt=now;if(condition==='disabled')row.tier.active=false;
 expect(vipCapabilities(condition==='missing'?null:row,now)).toEqual({vipPrivileges:[],vipLevel:0,vipNameColor:null,vipXpMultiplierBps:10000});
});
it('batches identities, deduplicates queries and represents non-VIPs explicitly',async()=>{
 const db={vipMembership:{findMany:vi.fn(async()=>[membership()])}};
 const result=await usersVip(['vip','normal','vip'],db,now);expect(result.get('normal').vipPrivileges).toEqual([]);expect(result.get('vip').vipLevel).toBe(5);expect(db.vipMembership.findMany).toHaveBeenCalledTimes(1);
});
it('owner override is explicit; ordinary room admins cannot moderate protected targets',async()=>{
 const db=fixture();await expect(assertVipModeration(db,room,'admin','vip','ANTI_KICK')).rejects.toMatchObject({code:'VIP_PROTECTED',status:403});
 await expect(assertVipModeration(db,room,'owner','vip','ANTI_KICK')).resolves.toBeUndefined();
 await expect(assertVipModeration(fixture(null),room,'admin','vip','ANTI_KICK')).resolves.toBeUndefined();
});
it('guards socket force mute, individual unseat and bulk unseat without blocking unmute',async()=>{
 const db=fixture(),socket={rooms:new Set(['audio-room:ROOM-1'])};
 for(const [event,input]of [['seat-force-mute',{muted:true}],['seat-kick',{}],['seats-bulk',{action:'CLEAR_ALL'}]])await expect(guardRoomSocketAction(db,socket,'admin',`audio-room:${event}`,{roomId:'ROOM-1',userId:'USR-vip',seatId:'row0-seat1',...input})).rejects.toMatchObject({code:'VIP_PROTECTED'});
 await expect(guardRoomSocketAction(db,socket,'admin','audio-room:seat-force-mute',{roomId:'ROOM-1',userId:'USR-vip',muted:false})).resolves.toBeUndefined();
});
it('anti-lock bypasses passwords but never bans or owner-only restrictions',async()=>{
 const db=fixture();expect((await roomAccessCheck(db,room,'vip',now)).code).toBeNull();
 expect((await roomAccessCheck(fixture(null),room,'normal',now)).code).toBe('ROOM_PASSWORD_REQUIRED');
 expect((await roomAccessCheck(db,{...room,joiningDisabled:true},'vip',now)).code).toBe('ROOM_OWNER_ONLY');
 db.audioRoomBan.findFirst=async()=>({});expect((await roomAccessCheck(db,room,'vip',now)).code).toBe('ROOM_BANNED');
});
it('routes invisible membership and departures only to owner/admin channels, never the public room',async()=>{
 const events=[],io={to:channel=>({emit:(event,payload)=>events.push({channel,event,payload})})};
 for(const event of ['audio-room:member-joined','audio-room:member-left'])await emitVipRoomPresence(fixture(),io,room,{id:'vip'},event,{userId:'USR-vip'});
 expect(events).toHaveLength(4);expect(events.every(e=>e.channel==='user:USR-owner'||e.channel==='user:USR-admin')).toBe(true);expect(events.every(e=>e.payload.data.silent)).toBe(true);
});
it('prioritizes only opted-in VIPs within score ties and keeps higher scores ahead',()=>{
 const rows=[['A',1n,99,[]],['B',1n,2,['RANKING_PRIORITY']],['C',1n,5,['RANKING_PRIORITY']],['D',2n,0,[]]].map(([publicId,score,vipLevel,vipPrivileges])=>({score,user:{publicId,vipLevel,vipPrivileges}}));
 expect(sortRankingEntries(rows).map(r=>r.user.publicId)).toEqual(['D','C','B','A']);expect(vipPriority(rows[0].user,rows[1].user)).toBeGreaterThan(0);
});
it('validates tier multipliers and name colors without enabling privileges implicitly',()=>{
 const body={name:'Test',level:1,validDays:30,privileges:[]};
 for(const xpMultiplierBps of [0,9999,100001,NaN,10000.5])expect(()=>validateVipTier({...body,xpMultiplierBps})).toThrow();
 expect(validateVipTier({...body,xpMultiplierBps:12500,nameColor:'#D946EF'})).toMatchObject({xpMultiplierBps:12500,privileges:[]});expect(()=>validateVipTier({...body,nameColor:'red'})).toThrow();
});

it('marks only conversations with a CS agent and an active priority VIP as priority support',async()=>{
 const {isVipPrioritySupport}=await import('./vip-support.js');
 const c={kind:'DIRECT',participants:[{user:{id:'cs',appRoles:['CS']}},{user:{id:'vip',appRoles:[]}}]};
 const map=new Map([['vip',vipCapabilities(membership(['CUSTOMER_SERVICE']))]]);
 expect(isVipPrioritySupport(c,map)).toBe(true);expect(isVipPrioritySupport({...c,kind:'GROUP'},map)).toBe(false);
 expect(isVipPrioritySupport(c,new Map())).toBe(false);expect(isVipPrioritySupport({...c,participants:[c.participants[1]]},map)).toBe(false);
});
