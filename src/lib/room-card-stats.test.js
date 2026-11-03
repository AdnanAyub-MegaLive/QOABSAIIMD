import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { roomCardStats } from "./room-card-stats.js";

describe("roomCardStats", () => {
  it("batches gift totals and claimable red envelopes per page", async () => {
    const db = {
      redEnvelopeSettings: { findUnique: vi.fn(async () => null) },
      $queryRaw: vi.fn(async () => [{ roomId: "R1", coins: 5000n }]),
      redEnvelope: { groupBy: vi.fn(async () => [{ audioRoomId: "db-2", _count: { _all: 2 } }]) },
    };
    const now = new Date("2026-10-31T00:00:00Z");
    const stats = await roomCardStats([{ id: "db-1", roomId: "R1" }, { id: "db-2", roomId: "R2" }], db, now);
    expect(stats.get("R1")).toEqual({ giftTotalCoins: "5000", activeRedEnvelopeCount: 0 });
    expect(stats.get("R2")).toEqual({ giftTotalCoins: "0", activeRedEnvelopeCount: 2 });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.redEnvelope.groupBy.mock.calls[0][0].where).toEqual({ audioRoomId: { in: ["db-1", "db-2"] }, status: "ACTIVE", remainingShares: { gt: 0 }, expiresAt: { gt: now }, totalCoins: { gt: 0n } });
  });

  it("skips queries for an empty page", async () => {
    const db = { $queryRaw: vi.fn(), redEnvelope: { groupBy: vi.fn() } };
    expect((await roomCardStats([], db)).size).toBe(0);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

it("counts only active, unexpired, unclaimed envelopes strictly above the configured total", async () => {
  const now = new Date("2026-11-02T00:00:00Z");
  const rows = [500n, 1000n, 5000n].map(totalCoins => ({ totalCoins, status: "ACTIVE", remainingShares: 1, expiresAt: new Date(now.getTime()+1000) }));
  rows.push({ ...rows[2], status: "EXPIRED" }, { ...rows[2], remainingShares: 0 }, { ...rows[2], expiresAt: now });
  const db = {
    redEnvelopeSettings: { findUnique: async () => ({ roomCardMinCoins: 1000n }) },
    $queryRaw: async () => [],
    redEnvelope: { groupBy: vi.fn(async ({ where }) => [{ audioRoomId: "db-1", _count: { _all: rows.filter(r => r.totalCoins > where.totalCoins.gt && r.status === where.status && r.remainingShares > where.remainingShares.gt && r.expiresAt > where.expiresAt.gt).length } }]) },
  };
  const result = await roomCardStats([{ id: "db-1", roomId: "R1" }], db, now);
  expect(result.get("R1").activeRedEnvelopeCount).toBe(1);
  expect(db.redEnvelope.groupBy.mock.calls[0][0].where.totalCoins).toEqual({ gt: 1000n });
});
