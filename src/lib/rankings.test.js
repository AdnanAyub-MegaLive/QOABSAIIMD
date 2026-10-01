import { describe, expect, it } from "vitest";
import {
  decodeRankingCursor,
  encodeRankingCursor,
  liveRoomScore,
  rankingPeriodStart,
  sortRankingEntries,
} from "./rankings";

describe("rankings helpers", () => {
  it("uses UTC boundaries for day, week, and month", () => {
    const now = new Date("2026-08-12T18:30:00.000Z");
    expect(rankingPeriodStart("today", now).toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(rankingPeriodStart("week", now).toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(rankingPeriodStart("month", now).toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(rankingPeriodStart("allTime", now)).toBeNull();
  });

  it("sorts by numeric score and then permanent public ID", () => {
    const sorted = sortRankingEntries([
      { score: 50n, user: { publicId: "USR-200" } },
      { score: 100n, user: { publicId: "USR-300" } },
      { score: 100n, user: { publicId: "USR-100" } },
    ]);
    expect(sorted.map((entry) => entry.user.publicId)).toEqual(["USR-100", "USR-300", "USR-200"]);
  });

  it("round-trips opaque pagination cursors", () => {
    expect(decodeRankingCursor(encodeRankingCursor(40))).toBe(40);
    expect(() => decodeRankingCursor("not-a-cursor")).toThrow("cursor is invalid");
  });

  it("builds the documented live room activity score", () => {
    expect(liveRoomScore({ giftCoins: 5000n, liveMinutes: 90, participants: 12 })).toBe(6290n);
  });
});
