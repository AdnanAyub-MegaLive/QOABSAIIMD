import { describe, expect, it } from "vitest";
import { giftSenderPayload } from "./gift-sender";

describe("gift sender payload", () => {
  it("includes equipped room-chat decorations and progression defaults", () => {
    expect(giftSenderPayload(
      { publicId: "USR-1", name: "Sender", profileImage: "https://example.test/avatar.webp", vipLevel: 3 },
      { frameUrl: "frame", badgeUrl: "badge", chatBoxUrl: "chat-box" },
    )).toEqual({
      id: "USR-1",
      publicId: "USR-1",
      name: "Sender",
      profileImage: "https://example.test/avatar.webp",
      frameUrl: "frame",
      badgeUrl: "badge",
      chatBoxUrl: "chat-box",
      level: 0,
      vipLevel: 3,
      anchorLevel: 0,
    });
  });
});
