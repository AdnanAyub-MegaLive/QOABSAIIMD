import { expect, it, vi } from "vitest";
import { reverseGiftXp, reverseCommittedGiftXp } from "./gift-xp-reversal.js";

function fixture() {
  const entries = [];
  const row = { lifetimePoints: 100n, currentLevel: 1, revision: 2, track: "USER", configurationVersion: 9, user: { publicId: "USR-1" }, configuration: { levels: [{ track: "USER", level: 0, thresholdPoints: 0n }, { track: "USER", level: 1, thresholdPoints: 100n }] } };
  const tx = {
    giftTransaction: { findUnique: vi.fn(async () => ({ reversedAt: new Date() })) },
    progressLedger: {
      findMany: async () => [{ id: "award", userId: "u", track: "USER", deltaPoints: 80n, ruleVersion: 1, eligibleAmount: 40n, numerator: 2n, denominator: 1n, basis: "GIFT_XP" }],
      findUnique: async () => entries[0] ?? null,
      create: async ({ data }) => { entries.push(data); },
    },
    userProgress: { findUnique: async () => row, update: async ({ data }) => { Object.assign(row, { ...data, revision: row.revision + 1 }); } },
    realtimeOutbox: { create: vi.fn(async () => ({ id: "event" })) },
    activityLevelAward: { findUnique: async () => null },
  };
  return { tx, row, entries };
}
it("reverses original XP exactly once, downgrades and queues private notification", async () => {
  const { tx, row, entries } = fixture();
  expect(await reverseGiftXp(tx, "gift")).toEqual({ reversed: 1 });
  expect(await reverseGiftXp(tx, "gift")).toEqual({ reversed: 0 });
  expect(entries[0]).toMatchObject({ deltaPoints: -80n, ruleVersion: 1, reversalOfId: "award" });
  expect(row).toMatchObject({ lifetimePoints: 20n, currentLevel: 0, revision: 3 });
  expect(tx.realtimeOutbox.create).toHaveBeenCalledTimes(1);
});
it("refuses unreversed gifts and inconsistent totals", async () => {
  const { tx, row, entries } = fixture();
  tx.giftTransaction.findUnique.mockResolvedValueOnce({ reversedAt: null });
  await expect(reverseGiftXp(tx, "gift")).rejects.toThrow("fully reversed");
  row.lifetimePoints = 1n;
  await expect(reverseGiftXp(tx, "gift")).rejects.toThrow("reconciliation");
  expect(entries).toHaveLength(0);
});
it("reverses agency XP using original percentage and amount", async () => {
  const { tx } = fixture();
  tx.activityLevelAward = { findUnique: async () => ({ subjectId: "agency", amount: 1000n, xp: 100n, rateBps: 1000, ruleRevision: 2 }), createMany: vi.fn().mockResolvedValue({count:0}) };
  await reverseGiftXp(tx, "gift");
  expect(tx.activityLevelAward.createMany).toHaveBeenCalledWith({skipDuplicates:true,data:[expect.objectContaining({ xp: -100n, amount: -1000n, sourceId: "reversal:gift", ruleRevision: 2 })]});
});
it("retries serialization failures with a bounded serializable transaction", async () => {
  const db = { $transaction: vi.fn().mockRejectedValueOnce({ code: "P2034" }).mockResolvedValue({ reversed: 0 }) };
  expect(await reverseCommittedGiftXp("gift", null, db)).toEqual({ reversed: 0 });
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
});
