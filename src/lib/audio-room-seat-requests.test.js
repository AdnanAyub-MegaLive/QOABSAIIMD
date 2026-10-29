import { describe,it,expect,vi } from 'vitest';
import { createSeatRequest,respondSeatRequest,listSeatRequests,seatRequestData,deliverSeatResolutions,cancelSeatRequests,sweepSeatRequests } from './audio-room-seat-requests.js';

function fixture(){
  const room={id:'r',roomId:'ROOM-1',ownerId:'owner',status:'LIVE',isBlocked:false,seatLayout:[3]};
  const users=Object.fromEntries(['owner','admin','target','ordinary','admin2'].map(id=>[id,{id,publicId:`USR-${id}`,status:'ACTIVE',name:id,profileImage:null}]));
  const roles={admin:{role:'ADMIN'},admin2:{role:'ADMIN'}};
  const row={id:'req',audioRoomId:'r',requesterId:'target',seatId:'row0-seat1',status:'PENDING',note:null,createdAt:new Date(),expiresAt:new Date(Date.now()+60000),audioRoom:room,requester:users.target};
  const seat={id:'s',audioRoomId:'r',seatId:'row0-seat1',occupantUserId:null,isLocked:true,isForceMuted:true};
  const db={
    audioRoom:{findUnique:vi.fn(async()=>room),update:vi.fn()},
    user:{findUnique:vi.fn(async({where})=>where.id?users[where.id]:Object.values(users).find(u=>u.publicId===where.publicId))},
    audioRoomMember:{findUnique:vi.fn(async()=>({socketCount:1}))},
    audioRoomRole:{findUnique:vi.fn(async({where})=>roles[where.audioRoomId_userId.userId]??null)},
    ban:{findFirst:vi.fn(async()=>null)},audioRoomBan:{findFirst:vi.fn(async()=>null)},userBlock:{findFirst:vi.fn(async()=>null)},
    audioRoomSeat:{findFirst:vi.fn(async()=>null),findMany:vi.fn(async()=>[seat]),updateMany:vi.fn(async({data})=>{if(seat.occupantUserId)return {count:0};Object.assign(seat,data);return {count:1};})},
    audioRoomSeatRequest:{findUnique:vi.fn(async()=>row),findFirst:vi.fn(async()=>null),findMany:vi.fn(async()=>[row]),count:vi.fn(async()=>0),create:vi.fn(async({data})=>({...row,...data})),update:vi.fn(),updateMany:vi.fn(async({data})=>{if(row.status!=='PENDING'&&data.status)return {count:0};Object.assign(row,data);return {count:1};})},
  };
  // Serialize mock transactions and roll back failed mutations, as the real DB does.
  let queue=Promise.resolve();
  db.$transaction=work=>{const run=queue.then(async()=>{const oldRow={...row},oldSeat={...seat};try{return await work(db);}catch(e){Object.assign(row,oldRow);Object.assign(seat,oldSeat);throw e;}});queue=run.catch(()=>{});return run;};
  return {db,room,users,roles,row,seat};
}
const respond=(f,patch={},actor='owner')=>respondSeatRequest(f.db,actor,{roomId:'ROOM-1',requestId:'req',accepted:true,...patch});
describe('persisted seat requests',()=>{
  it('issues a server expiry and persists the requested seat',async()=>{
    const f=fixture();const before=Date.now();const result=await createSeatRequest(f.db,'target',{roomId:'ROOM-1',seatId:'row0-seat1'});
    expect(result.created).toBe(true);expect(result.row.expiresAt.getTime()).toBeGreaterThanOrEqual(before+60000);
    expect(result.row.requesterId).toBe('target');
  });
  it.each(['owner','admin'])('%s approves a locked seat without unlocking or clearing force mute',async actor=>{
    const f=fixture();const result=await respond(f,{},actor);
    expect(result.status).toBe('APPROVED');expect(f.seat).toMatchObject({occupantUserId:'target',isLocked:true,isForceMuted:true,isMuted:true});
  });
  it('denial does not change the seat',async()=>{const f=fixture();expect((await respond(f,{accepted:false},'admin')).status).toBe('DENIED');expect(f.db.audioRoomSeat.updateMany).not.toHaveBeenCalled();});
  it('ordinary members cannot respond or read pending requester details',async()=>{const f=fixture();await expect(respond(f,{},'ordinary')).rejects.toMatchObject({code:'ROOM_PERMISSION_DENIED'});await expect(listSeatRequests(f.db,'ordinary','ROOM-1')).rejects.toMatchObject({code:'ROOM_PERMISSION_DENIED'});});
  it.each([{requesterId:'USR-ordinary'},{seatId:'row0-seat2'}])('rejects forged identity/seat %j',async patch=>{await expect(respond(fixture(),patch)).rejects.toMatchObject({code:'SEAT_REQUEST_MISMATCH'});});
  it('rejects another room and expired requests',async()=>{const f=fixture();f.row.audioRoomId='other';await expect(respond(f)).rejects.toMatchObject({code:'SEAT_REQUEST_NOT_FOUND'});f.row.audioRoomId='r';f.row.expiresAt=new Date(0);await expect(respond(f)).rejects.toMatchObject({code:'SEAT_REQUEST_EXPIRED'});});
  it('rolls back approval when the seat is occupied',async()=>{const f=fixture();f.seat.occupantUserId='other';await expect(respond(f)).rejects.toMatchObject({code:'SEAT_OCCUPIED'});expect(f.row.status).toBe('PENDING');});
  it('only one simultaneous moderator can resolve; repeated taps reject',async()=>{const f=fixture();const results=await Promise.allSettled([respond(f),respond(f,{},'admin')]);expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);await expect(respond(f)).rejects.toMatchObject({code:'SEAT_REQUEST_RESOLVED'});expect(f.db.audioRoomSeat.updateMany).toHaveBeenCalledTimes(1);});
  it('revoked moderators and disconnected requesters cannot approve',async()=>{const f=fixture();delete f.roles.admin;await expect(respond(f,{},'admin')).rejects.toMatchObject({code:'ROOM_PERMISSION_DENIED'});f.db.audioRoomMember.findUnique.mockResolvedValue({socketCount:0});await expect(respond(f)).rejects.toMatchObject({code:'JOIN_ROOM_FIRST'});});
  it('blocks suspended/banned targets and closed rooms',async()=>{const f=fixture();f.users.target.status='SUSPENDED';await expect(respond(f)).rejects.toMatchObject({code:'ROOM_PERMISSION_DENIED'});f.users.target.status='ACTIVE';f.db.audioRoomBan.findFirst.mockResolvedValue({id:'ban'});await expect(respond(f)).rejects.toMatchObject({code:'ROOM_PERMISSION_DENIED'});f.room.status='IDLE';await expect(respond(f)).rejects.toMatchObject({code:'ROOM_UNAVAILABLE'});});
  it('rejects owner-only seats',async()=>{const f=fixture();f.row.seatId='owner';await expect(respond(f)).rejects.toMatchObject({code:'SEAT_NOT_FOUND'});});
  it('protects peer admins',async()=>{const f=fixture();f.roles.target={role:'ADMIN'};await expect(respond(f,{},'admin')).rejects.toMatchObject({code:'PROTECTED_ROOM_MEMBER'});});
  it('public results contain no private IDs or RTC secrets',()=>{const data=seatRequestData(fixture().row);expect(data.requesterId).toBe('USR-target');expect(data).not.toHaveProperty('audioRoomId');expect(data).not.toHaveProperty('trtc');});
  it('pending recovery lists are paginated and exclude expired records in the query',async()=>{
    const f=fixture();f.db.audioRoomSeatRequest.findMany.mockResolvedValue([f.row,{...f.row,id:'next'}]);
    const result=await listSeatRequests(f.db,'admin','ROOM-1',{limit:1});expect(result.items).toHaveLength(1);expect(result.nextCursor).toBe('req');
    expect(f.db.audioRoomSeatRequest.findMany.mock.calls[0][0].where).toMatchObject({status:'PENDING',expiresAt:{gt:expect.any(Date)}});
  });
  it('leave/switch cleanup only resolves pending scoped requests',async()=>{
    const f=fixture();await cancelSeatRequests(f.db,{requesterId:'target',audioRoomId:{not:'new-room'}});
    expect(f.db.audioRoomSeatRequest.updateMany).toHaveBeenCalledWith({where:{requesterId:'target',audioRoomId:{not:'new-room'},status:'PENDING'},data:{status:'CANCELLED',respondedAt:expect.any(Date)}});
  });
  it('expires requests and cancels closed/blocked rooms without deletion',async()=>{
    const f=fixture();await sweepSeatRequests(f.db);
    expect(f.db.audioRoomSeatRequest.updateMany.mock.calls[0][0]).toMatchObject({where:{status:'PENDING',expiresAt:{lte:expect.any(Date)}},data:{status:'EXPIRED'}});
    expect(f.db.audioRoomSeatRequest.updateMany.mock.calls[1][0].data.status).toBe('CANCELLED');
  });
  it('delivers RTC credentials only to requester, never moderators or room',async()=>{
    const f=fixture();f.row.status='APPROVED';const emissions=[];
    const io={in:()=>({fetchSockets:async()=>['owner','admin','ordinary'].map(id=>({data:{userId:`USR-${id}`}}))}),to:channels=>({emit:(event,payload)=>emissions.push({channels,event,payload})})};
    await deliverSeatResolutions(f.db,io,async()=>({trtc:{secret:'test-ticket'}}));
    expect(emissions.find(e=>e.channels==='user:USR-target').payload.data.trtc.secret).toBe('test-ticket');
    const publicEmission=emissions.find(e=>Array.isArray(e.channels));expect(publicEmission.channels).toEqual(['user:USR-owner','user:USR-admin']);expect(publicEmission.payload.data).not.toHaveProperty('trtc');
  });
});
