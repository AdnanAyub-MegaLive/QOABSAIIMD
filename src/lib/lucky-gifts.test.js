import { expect, it } from "vitest";
import { chooseLuckyReward, expectedReturnBps, multiplierLabel, parseMultiplier, pickMultiplier, settleLuckyReward, validateLuckyPolicy } from "./lucky-gifts.js";

const table = [{ multiplierBps: 0, weight: 2 }, { multiplierBps: 10000, weight: 1 }, { multiplierBps: 5000000, weight: 1 }];
const fixed = (value) => () => value;

it("parses and labels multipliers", () => {
  expect(parseMultiplier("500")).toBe(5000000);
  expect(parseMultiplier("0.5")).toBe(5000);
  expect(multiplierLabel(5000000)).toBe("500");
  expect(multiplierLabel(5000)).toBe("0.5");
  expect(() => parseMultiplier("2000")).toThrow();
  expect(() => parseMultiplier("1.23456")).toThrow();
});

it("picks multipliers by weight", () => {
  expect(pickMultiplier(table, fixed(0))).toBe(0);
  expect(pickMultiplier(table, fixed(1))).toBe(0);
  expect(pickMultiplier(table, fixed(2))).toBe(10000);
  expect(pickMultiplier(table, fixed(3))).toBe(5000000);
});

it("pays the video example when the pool can cover it", () => {
  expect(chooseLuckyReward({ gross: 20n, poolBalance: 10000n, table, random: fixed(3) })).toEqual({ multiplierBps: 5000000, rewardCoins: 10000n, limitedByPool: false });
});

it("falls back to an affordable multiplier when the pool is short", () => {
  const result = chooseLuckyReward({ gross: 20n, poolBalance: 100n, table, random: (min, max) => (max === 4 ? 3 : max - 1) });
  expect(result).toEqual({ multiplierBps: 10000, rewardCoins: 20n, limitedByPool: true });
});

it("never pays more than the pool holds", () => {
  expect(chooseLuckyReward({ gross: 20n, poolBalance: 5n, table: [{ multiplierBps: 10000, weight: 1 }], random: fixed(0) })).toEqual({ multiplierBps: 0, rewardCoins: 0n, limitedByPool: true });
});

it("validates admin policy input", () => {
  const value = validateLuckyPolicy({ poolContributionPercent: "60", bigWinMinCoins: "10000", multipliers: [{ multiplier: "500", weight: 1 }, { multiplier: "1", weight: 99 }] });
  expect(value).toEqual({ poolContributionBps: 6000, bigWinMinCoins: 10000n, multipliers: [{ multiplierBps: 10000, weight: 99 }, { multiplierBps: 5000000, weight: 1 }] });
  expect(() => validateLuckyPolicy({ poolContributionPercent: "101", bigWinMinCoins: "1", multipliers: [{ multiplier: "1", weight: 1 }] })).toThrow();
  expect(() => validateLuckyPolicy({ poolContributionPercent: "50", bigWinMinCoins: "1", multipliers: [{ multiplier: "1", weight: 0 }] })).toThrow();
  expect(() => validateLuckyPolicy({ poolContributionPercent: "50", bigWinMinCoins: "1", multipliers: [{ multiplier: "1", weight: 1 }, { multiplier: "1.0", weight: 2 }] })).toThrow();
  expect(expectedReturnBps(value.multipliers)).toBe(59900);
});

it("settles the pool atomically and flags big wins", async () => {
  let pool = { id: "GLOBAL", balance: 9990n, collected: 0n, paidOut: 0n };
  const tx = {
    luckyGiftPool: {
      upsert: async () => pool,
      findUniqueOrThrow: async () => pool,
      update: async ({ data }) => { pool = { ...pool, balance: data.balance, collected: pool.collected + data.collected.increment, paidOut: pool.paidOut + data.paidOut.increment }; return pool; },
    },
    $queryRaw: async () => [],
  };
  const outcome = await settleLuckyReward(tx, { gross: 20n, contribution: 12n, policy: { multipliers: table, bigWinMinCoins: 10000n }, random: fixed(3) });
  expect(outcome).toMatchObject({ multiplierBps: 5000000, rewardCoins: 10000n, bigWin: true });
  expect(pool).toMatchObject({ balance: 2n, collected: 12n, paidOut: 10000n });
});
