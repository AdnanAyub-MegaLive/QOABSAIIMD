import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { roomCardStats } from "./room-card-stats.js";

describe("roomCardStats", () => {
  it("batches gift totals and claimable red envelopes per page", async () => {
    const db = {
      $queryRaw: vi.fn(async () => [{ roomId: "R1", coins: 5000n }]),
      redEnvelope: { groupBy: vi.fn(async () => [{ audioRoomId: "db-2", _count: { _all: 2 } }]) },
    };
    const now = new Date("2026-10-31T00:00:00Z");
    const stats = await roomCardStats([{ id: "db-1", roomId: "R1" }, { id: "db-2", roomId: "R2" }], db, now);
    expect(stats.get("R1")).toEqual({ giftTotalCoins: "5000", activeRedEnvelopeCount: 0 });
    expect(stats.get("R2")).toEqual({ giftTotalCoins: "0", activeRedEnvelopeCount: 2 });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.redEnvelope.groupBy.mock.calls[0][0].where).toEqual({ audioRoomId: { in: ["db-1", "db-2"] }, status: "ACTIVE", remainingShares: { gt: 0 }, expiresAt: { gt: now } });
  });

  it("skips queries for an empty page", async () => {
    const db = { $queryRaw: vi.fn(), redEnvelope: { groupBy: vi.fn() } };
    expect((await roomCardStats([], db)).size).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
