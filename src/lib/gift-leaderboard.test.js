import { describe, expect, it } from "vitest";
import {
  roomGiftHistoryLimit,
  serializeRoomGiftTransaction,
} from "./gift-leaderboard";

describe("room gift management helpers", () => {
  it("uses a safe bounded history page size", () => {
    expect(roomGiftHistoryLimit(null)).toBe(20);
    expect(roomGiftHistoryLimit("1")).toBe(1);
    expect(roomGiftHistoryLimit("50")).toBe(50);
    expect(roomGiftHistoryLimit("500")).toBe(50);
    expect(roomGiftHistoryLimit("0")).toBe(20);
    expect(roomGiftHistoryLimit("invalid")).toBe(20);
  });

  it("serializes user recipients and bigint coin totals", () => {
    expect(
      serializeRoomGiftTransaction(
        {
          id: "gift-cuid",
          createdAt: new Date("2026-09-23T10:00:00.000Z"),
          quantity: 2,
          coinValue: 500n,
          giftName: "Roaring Lion Gift",
          sender: {
            publicId: "USR-1",
            name: "Baidi",
            profileImage: null,
          },
          recipientUser: {
            publicId: "USR-2",
            name: "Someone",
            profileImage: "https://example.com/recipient.webp",
          },
          talent: null,
          giftAsset: { name: "Roaring Lion Gift" },
        },
        "https://portal.example/gift.webp",
      ),
    ).toEqual({
      id: "gift-cuid",
      createdAt: "2026-09-23T10:00:00.000Z",
      quantity: 2,
      coins: "500",
      sender: { publicId: "USR-1", name: "Baidi", profileImage: null },
      recipient: {
        publicId: "USR-2",
        name: "Someone",
        profileImage: "https://example.com/recipient.webp",
      },
      gift: {
        name: "Roaring Lion Gift",
        mediaUrl: "https://portal.example/gift.webp",
      },
    });
  });

  it("falls back to the talent identity for legacy talent-only gifts", () => {
    const result = serializeRoomGiftTransaction({
      id: "gift-cuid",
      createdAt: new Date("2026-09-23T10:00:00.000Z"),
      quantity: 1,
      coinValue: 100n,
      giftName: "Rose",
      sender: { publicId: "USR-1", name: "Sender", profileImage: null },
      recipientUser: null,
      talent: { publicId: "TLN-2", displayName: "Host", profileImage: null },
      giftAsset: null,
    });
    expect(result.recipient).toEqual({
      publicId: "TLN-2",
      name: "Host",
      profileImage: null,
    });
    expect(result.gift).toEqual({ name: "Rose", mediaUrl: null });
  });
});
