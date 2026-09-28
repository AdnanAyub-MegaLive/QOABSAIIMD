import { describe, expect, it } from "vitest";
import { decodeRoomChatCursor, encodeRoomChatCursor, ROOM_CHAT_MAX_LIMIT, ROOM_CHAT_VISIBLE_RETENTION_DAYS } from "./audio-room-chat";

describe("audio room chat contract", () => {
  it("uses a stable opaque pagination cursor", () => {
    const source = { id: "internal-message-id", createdAt: new Date("2026-09-28T12:00:00.000Z") };
    expect(decodeRoomChatCursor(encodeRoomChatCursor(source))).toEqual(source);
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeRoomChatCursor("not-a-cursor")).toThrow("invalid");
  });

  it("publishes explicit retention and page limits", () => {
    expect(ROOM_CHAT_VISIBLE_RETENTION_DAYS).toBe(30);
    expect(ROOM_CHAT_MAX_LIMIT).toBe(50);
  });
});
