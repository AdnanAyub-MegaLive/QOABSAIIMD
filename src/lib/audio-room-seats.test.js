import { describe, expect, it } from "vitest";
import {
  defaultAudioRoomSeatIds,
  seatErrorPayload,
} from "./audio-room-seats";

describe("audio room seat contract", () => {
  it("defines a stable three-by-four seat layout", () => {
    expect(defaultAudioRoomSeatIds).toHaveLength(12);
    expect(defaultAudioRoomSeatIds[0]).toBe("row0-seat1");
    expect(defaultAudioRoomSeatIds.at(-1)).toBe("row2-seat4");
    expect(new Set(defaultAudioRoomSeatIds).size).toBe(12);
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
