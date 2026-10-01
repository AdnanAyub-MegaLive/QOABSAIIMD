import { describe, expect, it } from "vitest";
import {
  audioRoomSeatIds,
  defaultAudioRoomSeatIds,
  normalizeAudioRoomSeatLayout,
  seatErrorPayload,
} from "./audio-room-seats";

describe("audio room seat contract", () => {
  it("defines the Android default three-four-four layout", () => {
    expect(defaultAudioRoomSeatIds).toHaveLength(11);
    expect(defaultAudioRoomSeatIds[0]).toBe("row0-seat1");
    expect(defaultAudioRoomSeatIds.at(-1)).toBe("row2-seat4");
    expect(new Set(defaultAudioRoomSeatIds).size).toBe(11);
  });

  it("supports real larger layouts up to twenty seats", () => {
    expect(normalizeAudioRoomSeatLayout([2, 3, 5, 5])).toEqual([2, 3, 5, 5]);
    expect(audioRoomSeatIds([2, 3, 5, 5])).toHaveLength(15);
    expect(() => normalizeAudioRoomSeatLayout([5, 5, 5, 5, 1])).toThrow("more than 20");
    expect(() => normalizeAudioRoomSeatLayout([0, 4, 4])).toThrow("1 to 5");
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
