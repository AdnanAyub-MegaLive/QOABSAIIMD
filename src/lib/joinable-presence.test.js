import {expect,it,vi} from 'vitest';
import {joinableAudioPresence} from './joinable-presence';
function setup(){
 const now=new Date(),viewer={id:'v',publicId:'V'},target={id:'t',publicId:'T'};
 const room={id:'r',roomId:'0001',ownerId:'owner',privacyMode:'PUBLIC',status:'LIVE'};
 const sockets=[{data:{audioPresenceLeaseUntil:now.getTime()+10000},rooms:new Set(['audio-room:0001'])}];
 const fetchSockets=vi.fn(async()=>sockets);
 const db={userFollow:{count:vi.fn(async()=>2)},userBlock:{findFirst:vi.fn(async()=>null)},user:{findFirst:vi.fn(async()=>target)},audioRoom:{findUnique:vi.fn(async()=>room)},audioRoomBan:{findFirst:vi.fn(async()=>null)}};
 return {db,room,sockets,fetchSockets,viewer,target,now,run:()=>joinableAudioPresence(db,viewer,target,{in:()=>({fetchSockets})},now)};
}
it('returns only a lease-bounded hint for mutual followers, independent of seat or ownership',async()=>{
 const f=setup();expect(await f.run()).toEqual({type:'AUDIO',roomId:'0001',expiresAt:new Date(f.now.getTime()+10000).toISOString()});
 f.room.ownerId='t';expect((await f.run()).roomId).toBe('0001');
});
it.each([0,1])('one-way follows and friendship alone do not qualify (%s)',async n=>{const f=setup();f.db.userFollow.count.mockResolvedValue(n);expect(await f.run()).toBeNull();});
it('blocks, unfollows and inactive identities hide presence',async()=>{
 const f=setup();f.db.userBlock.findFirst.mockResolvedValue({});expect(await f.run()).toBeNull();
 f.db.userBlock.findFirst.mockResolvedValue(null);f.db.userFollow.count.mockResolvedValueOnce(2).mockResolvedValue(1);expect(await f.run()).toBeNull();
 f.db.userFollow.count.mockResolvedValue(2);f.db.user.findFirst.mockResolvedValue(null);expect(await f.run()).toBeNull();
});
it.each(['ENDED','IDLE','TERMINATED'])('closed/non-live rooms are hidden (%s)',async status=>{const f=setup();f.room.status=status;expect(await f.run()).toBeNull();});
it.each(['PASSWORD','PAID','PRIVATE'])('private rooms are not disclosed (%s)',async privacy=>{const f=setup();f.room.privacyMode=privacy;expect(await f.run()).toBeNull();});
it('blocked rooms and viewer room bans are hidden',async()=>{const f=setup();f.room.isBlocked=true;expect(await f.run()).toBeNull();f.room.isBlocked=false;f.db.audioRoomBan.findFirst.mockResolvedValue({});expect(await f.run()).toBeNull();});
it('expired, disconnected and ambiguous sessions are hidden',async()=>{
 const f=setup();f.sockets[0].data.audioPresenceLeaseUntil=Date.now()-1;expect(await f.run()).toBeNull();
 f.sockets[0].data.audioPresenceLeaseUntil=Date.now()+10000;f.sockets[0].rooms.add('audio-room:0002');expect(await f.run()).toBeNull();
 f.sockets.length=0;expect(await f.run()).toBeNull();
});
it('switching or leaving during resolution does not disclose stale rooms',async()=>{
 const f=setup();f.fetchSockets.mockResolvedValueOnce(f.sockets).mockResolvedValue([]);expect(await f.run()).toBeNull();
});
it('evaluates each viewer independently without caching authorization',async()=>{
 const f=setup();expect(await f.run()).not.toBeNull();f.viewer.id='other';f.db.userFollow.count.mockResolvedValue(0);expect(await f.run()).toBeNull();
});
