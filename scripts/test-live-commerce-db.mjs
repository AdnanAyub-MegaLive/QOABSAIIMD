import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { applyLiveGiftReward } = await import("../src/lib/live-commerce.js");
const rollback = new Error("ROLLBACK_TEST");
try {
  await prisma.$transaction(async tx => {
    const host = await tx.user.create({ data: { publicId: `TEST-${randomUUID()}`, name: "Live reward test" } });
    const live = await tx.videoLiveSession.create({ data: { publicId: `TEST-${randomUUID()}`, hostId: host.id, title: "Reward test", rewardTargetCoins: 100n, targetRewardCoins: 10n, liveRuleVersion: 1 } });
    await applyLiveGiftReward(tx, live, host.id, 1000n);
    assert.equal((await tx.user.findUnique({ where: { id: host.id } })).coinBalance, 0n);
    await applyLiveGiftReward(tx, live, "other", 99n);
    assert.equal((await tx.user.findUnique({ where: { id: host.id } })).coinBalance, 0n);
    await applyLiveGiftReward(tx, live, "other", 1n);
    await applyLiveGiftReward(tx, live, "other", 100n);
    assert.equal((await tx.user.findUnique({ where: { id: host.id } })).coinBalance, 10n);
    assert.equal(await tx.walletTransaction.count({ where: { userId: host.id, type: "LIVE_TARGET_REWARD" } }), 1);
    throw rollback;
  }, { isolationLevel: "Serializable", timeout: 15000 });
} catch (e) { if (e !== rollback) throw e; console.log("PASS: self-gift exclusion, threshold, one reward ledger credit; test fixtures rolled back."); }
finally { await prisma.$disconnect(); }
