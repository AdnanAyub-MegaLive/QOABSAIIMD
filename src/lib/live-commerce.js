import { prisma } from "./prisma.js";
import { ledgerData } from "./wallet.js";
export const LIVE_GIFT_CATEGORY = "LIVE_GIFTS";
export function getLiveCommerceRule(db = prisma) {
  return db.liveCommerceRule.upsert({ where: { id: "LIVE" }, update: {}, create: { id: "LIVE" } });
}
export function liveRewardSnapshot(rule) {
  return { liveRuleVersion: rule.version, rewardTargetCoins: rule.rewardsEnabled ? rule.targetCoins : 0n, targetRewardCoins: rule.rewardsEnabled ? rule.rewardCoins : 0n };
}
export function rewardIsDue(row) {
  return !row.targetRewardPaid && row.rewardTargetCoins > 0n && row.targetRewardCoins > 0n && row.eligibleGiftCoins >= row.rewardTargetCoins;
}
// Called inside the gift's serializable transaction; the row update serializes
// concurrent gifts, and the conditional marker makes the credit exactly once.
export async function applyLiveGiftReward(tx, live, senderId, grossCoins) {
  const row = await tx.videoLiveSession.update({ where: { id: live.id }, data: {
    eligibleGiftCoins: { increment: senderId === live.hostId ? 0n : grossCoins },
  } });
  if (!rewardIsDue(row)) return;
  const claimed = await tx.videoLiveSession.updateMany({ where: { id: row.id, targetRewardPaid: false }, data: { targetRewardPaid: true } });
  if (!claimed.count) return;
  await tx.user.update({ where: { id: row.hostId }, data: { coinBalance: { increment: row.targetRewardCoins } } });
  await tx.walletTransaction.create({ data: ledgerData({ userId: row.hostId, type: "LIVE_TARGET_REWARD", direction: "CREDIT", coins: row.targetRewardCoins, title: "Live gifting target reward", referenceId: row.publicId, metadata: { liveId: row.publicId, ruleVersion: row.liveRuleVersion, targetCoins: String(row.rewardTargetCoins), eligibleGiftCoins: String(row.eligibleGiftCoins) } }) });
}
