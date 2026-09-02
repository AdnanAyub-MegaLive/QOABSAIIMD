import { describe, expect, it } from "vitest";
import { listenerRoomJoinError } from "./audio-room-activation-policy";

describe("MegaLive idle-room activation policy", () => {
  it("allows listeners to join LIVE rooms", () => {
    expect(listenerRoomJoinError({ status: "LIVE" })).toBeNull();
  });

  it("allows listeners to join IDLE rooms", () => {
    expect(listenerRoomJoinError({ status: "IDLE" })).toBeNull();
  });

  it("keeps terminated and missing rooms unavailable to listeners", () => {
    expect(listenerRoomJoinError({ status: "TERMINATED" })).toEqual({
      code: "ROOM_UNAVAILABLE",
    });
    expect(listenerRoomJoinError(null)).toEqual({ code: "ROOM_UNAVAILABLE" });
  });
});
