import { describe, expect, it, vi } from "vitest";
import {
  audioRoomSeatIds,
  defaultAudioRoomSeatIds,
  normalizeAudioRoomSeatLayout,
  seatErrorPayload,
  reconcileAudioRoomLayoutSeats,
} from "./audio-room-seats";

describe("audio room seat contract", () => {
  it("defines the Android default three-four-four layout", () => {
    expect(defaultAudioRoomSeatIds).toHaveLength(11);
    expect(defaultAudioRoomSeatIds[0]).toBe("row0-seat1");
    expect(defaultAudioRoomSeatIds.at(-1)).toBe("row2-seat4");
    expect(new Set(defaultAudioRoomSeatIds).size).toBe(11);
  });

  it("supports 25 audience seats, excluding the owner's header seat", () => {
    expect(normalizeAudioRoomSeatLayout([2, 3, 5, 5])).toEqual([2, 3, 5, 5]);
    expect(audioRoomSeatIds([2, 3, 5, 5])).toHaveLength(15);
    const seats = audioRoomSeatIds([5, 5, 5, 5, 5]);
    expect(seats).toHaveLength(25);
    expect(new Set(seats).size).toBe(25);
    expect(seats.at(-1)).toBe('row4-seat5');
    expect(() => normalizeAudioRoomSeatLayout([5, 5, 5, 5, 5, 1])).toThrow("more than 25");
    expect(audioRoomSeatIds([4,4,4,4,4,5])).toHaveLength(25);
    expect(() => normalizeAudioRoomSeatLayout([1,1,1,1,1,1,1])).toThrow('1 to 6');
    expect(() => normalizeAudioRoomSeatLayout([6])).toThrow('1 to 5');
    expect(() => normalizeAudioRoomSeatLayout([0, 4, 4])).toThrow("1 to 5");
  });

  it('removes obsolete seats and returns occupants for RTC revocation while retaining valid seats', async () => {
    const tx = { audioRoomSeat: { findMany: vi.fn().mockResolvedValue([{occupant:{publicId:'USR-TEST'}}]), deleteMany:vi.fn(), createMany:vi.fn() }, audioRoom:{update:vi.fn()} };
    expect(await reconcileAudioRoomLayoutSeats(tx,{id:'room',seatLayout:[5,5,5,5]})).toEqual(['USR-TEST']);
    const where=tx.audioRoomSeat.deleteMany.mock.calls[0][0].where;
    expect(where.audioRoomId).toBe('room');
    expect(where.seatId.notIn).toHaveLength(20);
    expect(where.seatId.notIn).not.toContain('row4-seat5');
    expect(tx.audioRoomSeat.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(tx.audioRoom.update).toHaveBeenCalledWith({where:{id:'room'},data:{seatRevision:{increment:1}}});
  });

  it('does not discard occupants when RTC revocation fails', async () => {
    const tx={audioRoomSeat:{findMany:vi.fn().mockResolvedValue([{occupant:{publicId:'USR-TEST'}}]),deleteMany:vi.fn()}};
    await expect(reconcileAudioRoomLayoutSeats(tx,{id:'room',roomId:'ROOM-TEST',seatLayout:[1]},async()=>{throw Error('RTC unavailable');})).rejects.toThrow('RTC unavailable');
    expect(tx.audioRoomSeat.deleteMany).not.toHaveBeenCalled();
  });

  it("maps expected conflicts without leaking database errors", () => {
    expect(seatErrorPayload(new Error("SEAT_LOCKED"))).toEqual({
      code: "SEAT_LOCKED",
      message: "The selected seat is locked.",
    });
    expect(seatErrorPayload(new Error("unexpected"))).toEqual({
      code: "SEAT_OPERATION_FAILED",
      message: "Unable to update the seat right now.",
    });
  });
});
