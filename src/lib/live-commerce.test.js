import { expect, it } from "vitest";
import { rewardIsDue, liveRewardSnapshot } from "./live-commerce.js";
it("requires the exact committed threshold and grants only once", () => {
  const row = { targetRewardPaid: false, rewardTargetCoins: 100n, targetRewardCoins: 10n, eligibleGiftCoins: 99n };
  expect(rewardIsDue(row)).toBe(false);
  expect(rewardIsDue({ ...row, eligibleGiftCoins: 100n })).toBe(true);
  expect(rewardIsDue({ ...row, eligibleGiftCoins: 1000n, targetRewardPaid: true })).toBe(false);
  expect(rewardIsDue({ ...row, rewardTargetCoins: 0n })).toBe(false);
});
it("disables rewards without inventing amounts and snapshots enabled rules", () => {
  const rule = { version: 3, targetCoins: 100n, rewardCoins: 10n, rewardsEnabled: false };
  expect(liveRewardSnapshot(rule).rewardTargetCoins).toBe(0n);
  expect(liveRewardSnapshot({ ...rule, rewardsEnabled: true })).toEqual({ liveRuleVersion: 3, rewardTargetCoins: 100n, targetRewardCoins: 10n });
});
