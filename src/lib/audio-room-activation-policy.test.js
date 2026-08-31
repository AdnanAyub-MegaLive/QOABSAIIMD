import { describe, expect, it } from "vitest";
import { listenerRoomJoinError } from "./audio-room-activation-policy";

describe("MegaLive idle-room activation policy", () => {
  it("allows listeners to join only LIVE rooms", () => {
    expect(listenerRoomJoinError({ status: "LIVE" })).toBeNull();
  });

  it("never allows a listener to reactivate an IDLE room by its known ID", () => {
    expect(listenerRoomJoinError({ status: "IDLE" })).toEqual({
      code: "ROOM_IDLE",
      message: "This room is not live. Its owner must start it before anyone can join.",
    });
  });

  it("keeps terminated and missing rooms unavailable to listeners", () => {
    expect(listenerRoomJoinError({ status: "TERMINATED" })).toEqual({
      code: "ROOM_UNAVAILABLE",
    });
    expect(listenerRoomJoinError(null)).toEqual({ code: "ROOM_UNAVAILABLE" });
  });
});
