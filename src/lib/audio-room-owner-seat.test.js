import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ audioRoomSeat: { createMany: vi.fn() }, $transaction: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: db }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: vi.fn() }));
import { audioRoomOwnerSeatId, assertAudioRoomSeatOwner, takeAudioRoomSeat, moveAudioRoomSeat, moveAudioRoomMember, reconcileAudioRoomLayoutSeats } from "./audio-room-seats.js";

describe("owner centre seat", () => {
  const room = { id: "room", ownerId: "owner", seatLayout: [3,2,3,1] };
  beforeEach(() => vi.clearAllMocks());
  it("reserves one extra seat for each circular layout only", () => {
    for (const layout of [[3,2,3,1],[3,3,3,3,1],[4,4,4,4,1]]) {
      const centre = `row${layout.length-1}-seat1`;
      expect(audioRoomOwnerSeatId(layout)).toBe(centre);
      expect(() => assertAudioRoomSeatOwner({...room,seatLayout:layout}, "owner", centre)).not.toThrow();
      expect(() => assertAudioRoomSeatOwner({...room,seatLayout:layout}, "member", centre)).toThrow("SEAT_OWNER_REQUIRED");
    }
    expect(audioRoomOwnerSeatId([4,4])).toBeNull();
    expect(audioRoomOwnerSeatId([3,2,3])).toBeNull();
    expect(() => assertAudioRoomSeatOwner(room,"member","row0-seat1")).not.toThrow();
  });
  it("rejects take, move and moderator/invitation assignment using the current transactional layout", async () => {
    const tx = { audioRoom: { findUnique: vi.fn().mockResolvedValue(room) } };
    db.$transaction.mockImplementation(fn => fn(tx));
    const stale = {...room,seatLayout:[4,4,4,4]};
    await expect(takeAudioRoomSeat(stale,"member","row3-seat1")).rejects.toThrow("SEAT_OWNER_REQUIRED");
    await expect(moveAudioRoomSeat(stale,"member","row0-seat1","row3-seat1")).rejects.toThrow("SEAT_OWNER_REQUIRED");
    await expect(moveAudioRoomMember(stale,"member","row3-seat1",{allowLocked:true})).rejects.toThrow("SEAT_OWNER_REQUIRED");
  });
  it("lets the owner take the centre seat", async () => {
    const target={id:"seat",occupantUserId:"owner",isLocked:false};
    db.$transaction.mockImplementation(fn => fn({audioRoom:{findUnique:vi.fn().mockResolvedValue(room)},audioRoomSeat:{findUnique:vi.fn().mockResolvedValue(target)}}));
    await expect(takeAudioRoomSeat(room,"owner","row3-seat1")).resolves.toEqual(target);
  });
  it("revokes a non-owner when a retained seat becomes the owner seat", async () => {
    const revoke=vi.fn();
    const tx={audioRoomSeat:{findMany:vi.fn().mockResolvedValueOnce([{occupant:{publicId:"USR-MEMBER"}}]).mockResolvedValueOnce([]),updateMany:vi.fn(),deleteMany:vi.fn(),createMany:vi.fn()},audioRoom:{update:vi.fn()}};
    expect(await reconcileAudioRoomLayoutSeats(tx,{...room,roomId:"ROOM"},revoke)).toEqual(["USR-MEMBER"]);
    expect(revoke).toHaveBeenCalledWith("ROOM","USR-MEMBER",false);
    expect(tx.audioRoomSeat.updateMany).toHaveBeenCalled();
  });
});
