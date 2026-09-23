import { describe, expect, it } from "vitest";
import {
  parseRoomGiftRankingQuery,
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
      sender: {
        publicId: "USR-1",
        name: "Baidi",
        profileImage: null,
        frameUrl: null,
      },
      recipient: {
        publicId: "USR-2",
        name: "Someone",
        profileImage: "https://example.com/recipient.webp",
        frameUrl: null,
      },
      gift: {
        name: "Roaring Lion Gift",
        mediaUrl: "https://portal.example/gift.webp",
      },
    });
  });

  it("returns a null recipient for legacy talent-only gifts", () => {
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
    expect(result.recipient).toBeNull();
    expect(result.gift).toEqual({ name: "Rose", mediaUrl: null });
  });

  it("adds each user's own resolved frame to history identities", () => {
    const result = serializeRoomGiftTransaction(
      {
        id: "gift-cuid",
        createdAt: new Date("2026-09-23T10:00:00.000Z"),
        quantity: 1,
        coinValue: 100n,
        giftName: "Rose",
        sender: { publicId: "USR-1", name: "Sender", profileImage: null },
        recipientUser: {
          publicId: "USR-2",
          name: "Receiver",
          profileImage: null,
        },
        talent: null,
        giftAsset: null,
      },
      null,
      new Map([
        ["USR-1", { frameUrl: "https://portal.example/sender-frame" }],
        ["USR-2", { frameUrl: "https://portal.example/receiver-frame" }],
      ]),
    );
    expect(result.sender.frameUrl).toBe("https://portal.example/sender-frame");
    expect(result.recipient.frameUrl).toBe(
      "https://portal.example/receiver-frame",
    );
  });

  it("parses and caps gift-ranking pagination", () => {
    expect(
      parseRoomGiftRankingQuery(
        new URLSearchParams("type=senders&page=2&limit=100"),
      ),
    ).toEqual({ type: "senders", page: 2, limit: 50, offset: 50 });
    expect(
      parseRoomGiftRankingQuery(new URLSearchParams("type=receivers")),
    ).toEqual({ type: "receivers", page: 1, limit: 20, offset: 0 });
    expect(parseRoomGiftRankingQuery(new URLSearchParams())).toEqual({
      type: "senders",
      page: 1,
      limit: 20,
      offset: 0,
    });
  });

  it("rejects invalid gift-ranking parameters", () => {
    expect(() =>
      parseRoomGiftRankingQuery(new URLSearchParams("type=everyone")),
    ).toThrow("type must be senders or receivers");
    expect(() =>
      parseRoomGiftRankingQuery(new URLSearchParams("type=senders&page=0")),
    ).toThrow("page must be a positive whole number");
    expect(() =>
      parseRoomGiftRankingQuery(
        new URLSearchParams("type=receivers&limit=invalid"),
      ),
    ).toThrow("limit must be a positive whole number");
  });
});
