import {test,expect,vi} from 'vitest';
import {cancelSeatInvitation} from './seat-invitation-cancellation.js';
function fixture(status='PENDING') {
 const row={id:'i',audioRoomId:'internal',seatId:'3',status,target:{publicId:'B'},inviter:{publicId:'A'}};
 const db={audioRoomSeatInvitation:{findUnique:vi.fn(async()=>row),updateMany:vi.fn(async()=>{if(row.status!=='PENDING')return {count:0};row.status='CANCELLED';return {count:1};})}};
 return {db,row,room:{id:'internal',roomId:'R'}};
}
test('pending cancellation is repeatable, scoped and leaves accepted invitations intact',async()=>{
 const {db,room}=fixture();
 expect((await cancelSeatInvitation(db,room,'i')).data.status).toBe('CANCELLED');
 await cancelSeatInvitation(db,room,'i');expect(db.audioRoomSeatInvitation.updateMany).toHaveBeenCalledTimes(1);
 await expect(cancelSeatInvitation(db,{id:'other'},'i')).rejects.toMatchObject({code:'SEAT_INVITATION_NOT_FOUND'});
 const accepted=fixture('ACCEPTED');await expect(cancelSeatInvitation(accepted.db,accepted.room,'i')).rejects.toMatchObject({code:'SEAT_INVITATION_RESOLVED'});
});
test('acceptance winning the race cannot be cancelled',async()=>{
 const {db,room}=fixture();db.audioRoomSeatInvitation.updateMany.mockResolvedValue({count:0});
 await expect(cancelSeatInvitation(db,room,'i')).rejects.toMatchObject({code:'SEAT_INVITATION_RESOLVED'});
});
