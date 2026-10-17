import { prisma } from "./prisma.js";
import { appendOutbox, levelSnapshot } from "./progression.js";
import { queueActivityProgress } from "./activity-levels.js";
import { levelTagBackgrounds, tagBackground } from './level-tag-backgrounds.js';

// Internal service, not a financial refund endpoint. Call in the same
// transaction that marks a full gift refund, after its financial validation.
// Never recompute an award from today's price, XP or percentage settings.
export async function reverseGiftXp(tx, giftId, origin) {
  const gift = await tx.giftTransaction.findUnique({ where: { id: giftId } });
  if (!gift?.reversedAt) throw new Error("Gift must be marked fully reversed before reversing XP.");
  const awards = await tx.progressLedger.findMany({
    where: { sourceId: giftId, sourceType: { in: ["GIFT_SENT", "GIFT_RECEIVED"] }, reversalOfId: null, deltaPoints: { gt: 0n } },
    orderBy: [{ userId: "asc" }, { track: "asc" }, { id: "asc" }],
  });
  let reversed = 0;
  for (const award of awards) {
    if (await tx.progressLedger.findUnique({ where: { reversalOfId: award.id } })) continue;
    const row = await tx.userProgress.findUnique({ where: { userId_track: { userId: award.userId, track: award.track } }, include: { configuration: { include: { levels: true } }, user: { select: { publicId: true } } } });
    if (!row || row.lifetimePoints < award.deltaPoints) throw new Error("XP ledger requires reconciliation; reversal would create a negative total.");
    const previousLevel = row.currentLevel;
    const snapshot = levelSnapshot({ ...row, lifetimePoints: row.lifetimePoints - award.deltaPoints, revision: row.revision + 1 }, row.configuration.levels, origin);
    Object.assign(snapshot,tagBackground(await levelTagBackgrounds(tx,origin),award.track,snapshot.level));
    await tx.progressLedger.create({ data: {
      userId: award.userId, track: award.track, sourceType: "GIFT_REVERSAL", sourceId: giftId, sourceLineId: award.id,
      deltaPoints: -award.deltaPoints, reversalOfId: award.id, ruleVersion: award.ruleVersion,
      eligibleAmount: award.eligibleAmount, numerator: award.numerator, denominator: award.denominator, basis: award.basis,
    } });
    await tx.userProgress.update({ where: { userId_track: { userId: award.userId, track: award.track } }, data: { lifetimePoints: BigInt(snapshot.lifetimePoints), currentLevel: snapshot.level, revision: { increment: 1 } } });
    await appendOutbox(tx, `user:${row.user.publicId}`, "progression:updated", { ...snapshot, track: award.track, userId: row.user.publicId, sourceTransactionId: giftId, previousLevel, levelsGained: [], reason: "GIFT_REVERSAL" });
    reversed++;
  }
  const agencyAward = await tx.activityLevelAward.findUnique({ where: { track_sourceId: { track: "AGENCY", sourceId: giftId } } });
  if (agencyAward) {
    const inserted = await tx.activityLevelAward.createMany({ skipDuplicates: true, data: [{
      track: "AGENCY", sourceId: `reversal:${giftId}`, subjectId: agencyAward.subjectId,
      amount: -agencyAward.amount, xp: -agencyAward.xp, rateBps: agencyAward.rateBps, ruleRevision: agencyAward.ruleRevision,
    }] });
    if (inserted.count) await queueActivityProgress(tx,"AGENCY",agencyAward.subjectId,`reversal:${giftId}`);
  }
  return { reversed };
}

// Explicit invocation only: no startup sweep or historical backfill.
export async function reverseCommittedGiftXp(giftId, origin, db = prisma) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(tx => reverseGiftXp(tx, giftId, origin), { isolationLevel: "Serializable" });
    } catch (error) {
      if (!["P2034", "P2002"].includes(error.code) || attempt === 3) throw error;
    }
  }
}
