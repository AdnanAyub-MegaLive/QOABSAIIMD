import { describe, it, expect, vi } from 'vitest';
import { lockableRoomSeats, ownerCentreSeat, setRoomSeatLocks } from './room-seat-locks.js';
import { audioRoomSeatIds, reconcileAudioRoomLayoutSeats } from './audio-room-seats.js';

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(condition => matches(row, condition));
    if (key === 'AND') return value.every(condition => matches(row, condition));
    if (value && typeof value === 'object') return Object.entries(value).every(([op, v]) =>
      op === 'in' ? v.includes(row[key]) : op === 'notIn' ? !v.includes(row[key]) : op === 'not' ? row[key] !== v : false);
    return row[key] === value;
  });
}
function fixture(layout) {
  const room = { id: 'room', ownerId: 'owner-user', seatLayout: layout };
  const rows = audioRoomSeatIds(layout).map(seatId => ({ id: seatId, audioRoomId: room.id, seatId, occupantUserId: null, isLocked: false }));
  const tx = { $queryRaw: vi.fn(async () => []), audioRoom: { findUniqueOrThrow: vi.fn(async () => room), update: vi.fn() }, audioRoomSeat: {
    findFirst: vi.fn(async ({where}) => rows.find(r => matches(r, where))),
    findMany: vi.fn(async () => []), deleteMany: vi.fn(), createMany: vi.fn(),
    updateMany: vi.fn(async ({where, data}) => { const selected = rows.filter(r => matches(r, where)); selected.forEach(r => Object.assign(r, data)); return {count:selected.length}; }),
  } };
  return { room, rows, tx, db: {$transaction: work => work(tx)} };
}
describe('owner seat lock protection', () => {
  it.each([[3,2,3,1], [3,3,3,3,1], [4,4,4,4,1]].map(layout => [layout]))('locks only audience seats for %j, even with the owner absent', async layout => {
    const f = fixture(layout), centre = ownerCentreSeat(layout);
    f.rows.find(r => r.seatId === centre).isLocked = true;
    await setRoomSeatLocks(f.db, f.room, true);
    expect(f.rows.filter(r => r.isLocked)).toHaveLength(layout.reduce((a,b)=>a+b,0)-1);
    expect(f.rows.find(r => r.seatId === centre).isLocked).toBe(false);
    await setRoomSeatLocks(f.db, f.room, false);
    expect(f.rows.some(r => r.isLocked)).toBe(false);
  });
  it('retains owner alias and occupied-seat protection without excluding arbitrary single-row layouts', async () => {
    const f = fixture([3,2,1]);f.rows[0].occupantUserId = f.room.ownerId;
    f.rows.push(...['owner','0'].map(seatId=>({audioRoomId:'room',seatId,isLocked:true,occupantUserId:null})));
    await setRoomSeatLocks(f.db,f.room,true);
    expect(f.rows[0].isLocked).toBe(false);
    expect(f.rows.find(r=>r.seatId==='row2-seat1').isLocked).toBe(true);
    expect(f.rows.slice(-2).some(r=>r.isLocked)).toBe(false);
    expect(ownerCentreSeat([3,2,1])).toBeNull();
  });
  it('rejects a single centre lock using the current persisted layout and allows repair/unlock', async () => {
    const f=fixture([3,2,3,1]);
    await expect(setRoomSeatLocks(f.db,{...f.room,seatLayout:[4,4,4,4]},true,{seatId:'row3-seat1'})).rejects.toMatchObject({code:'OWNER_SEAT_PROTECTED'});
    expect(f.tx.audioRoomSeat.updateMany).not.toHaveBeenCalled();
    f.rows.at(-1).isLocked=true;
    await setRoomSeatLocks(f.db,f.room,false,{seatId:'row3-seat1'});
    expect(f.rows.at(-1).isLocked).toBe(false);
    await setRoomSeatLocks(f.db,f.room,true,{seatId:'row0-seat1',note:'Closed'});
    expect(f.rows[0]).toMatchObject({isLocked:true,note:'Closed'});
    expect(f.rows.filter(r=>r.isLocked)).toHaveLength(1);
  });
  it('unlocks a reused centre seat when saving a new Truth or Dare layout', async () => {
    const f=fixture([3,2,3,1]);f.rows.at(-1).isLocked=true;f.rows[0].isLocked=true;
    await reconcileAudioRoomLayoutSeats(f.tx,f.room);
    expect(f.rows.at(-1).isLocked).toBe(false);
    expect(f.rows[0].isLocked).toBe(true);
    expect(f.tx.audioRoom.update).toHaveBeenCalled();
  });
  it('scopes every lock predicate to its room', () => {
    expect(matches({audioRoomId:'other',seatId:'row0-seat1',occupantUserId:null},lockableRoomSeats(fixture([3,2,3,1]).room))).toBe(false);
  });
});
