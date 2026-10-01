import { describe, expect, it } from "vitest";
import { canSendLockedRoomMessage, normalizeRoomPassword, roomControlError } from "./audio-room-controls";

describe("audio room privacy and public-screen controls", () => {
  it("accepts only 4 to 6 digit room passwords and permits clearing", () => {
    expect(normalizeRoomPassword("1234")).toBe("1234");
    expect(normalizeRoomPassword("", { allowEmpty: true })).toBeNull();
    expect(() => normalizeRoomPassword("123")).toThrow("4 to 6 digits");
    expect(() => normalizeRoomPassword("secret")).toThrow("4 to 6 digits");
  });

  it("allows only the owner or a seated user while chat is locked", () => {
    expect(canSendLockedRoomMessage({ chatLocked: false, ownerId: "OWNER", seats: [] }, "LISTENER")).toBe(true);
    expect(canSendLockedRoomMessage({ chatLocked: true, ownerId: "OWNER", seats: [] }, "OWNER")).toBe(true);
    expect(canSendLockedRoomMessage({ chatLocked: true, ownerId: "OWNER", seats: [{ id: "SEAT" }] }, "SPEAKER")).toBe(true);
    expect(canSendLockedRoomMessage({ chatLocked: true, ownerId: "OWNER", seats: [] }, "LISTENER")).toBe(false);
  });

  it("returns stable socket error envelopes", () => {
    expect(roomControlError("CHAT_LOCKED")).toEqual({ success: false, error: { code: "CHAT_LOCKED", message: "The room public screen is locked." } });
  });
});
