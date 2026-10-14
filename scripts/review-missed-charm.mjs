// Read-only. Never recompute historical XP using today's editable gift values.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const { prisma } = await import("../src/lib/prisma.js");
const { resolveGiftProgressRecipient } = await import("../src/lib/progression.js");
const counts = {};
let cursor, scanned = 0;
const detailed = process.argv.includes("--details");
try {
  const configs = await prisma.progressionConfiguration.findMany();
  console.log(JSON.stringify({ configurationCoverage: configs.map(c => ({ version: c.version, enabled: c.enabled, active: c.active, charmRules: c.rules.filter(r => r.track === "CHARM").map(r => ({ source: r.source, recipientType: r.recipientType, basis: r.basis, numerator: r.numerator, denominator: r.denominator })) })) }));
  for (;;) {
    const gifts = await prisma.giftTransaction.findMany({ take: 250, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), orderBy: { id: "asc" }, include: { recipientUser: { select: { id: true, publicId: true, deletedAt: true } }, settlement: true } });
    if (!gifts.length) break;
    for (const gift of gifts) {
      scanned++;
      const recipient = await resolveGiftProgressRecipient(prisma, gift, gift.recipientUser?.deletedAt ? null : gift.recipientUser);
      const ledgers = await prisma.progressLedger.findMany({ where: { sourceId: gift.id } });
      let reason;
      if (gift.reversedAt) reason = "REVERSED_SKIP";
      else if (!recipient) reason = "UNMAPPED_ACCOUNT_REVIEW";
      else if (ledgers.some(l => l.track === "CHARM" && l.sourceType === "GIFT_RECEIVED")) reason = "ALREADY_AWARDED_SKIP";
      else if (!gift.settlement) reason = "MISSING_SETTLEMENT_REVIEW";
      else reason = "MISSING_CHARM_REVIEW";
      counts[reason] = (counts[reason] ?? 0) + 1;
      if (detailed && reason.endsWith("REVIEW")) console.log(JSON.stringify({ giftId: gift.id, createdAt: gift.createdAt, recipientUserId: recipient?.id ?? null, talentId: gift.talentId, quantity: gift.quantity, recipientType: gift.settlement?.recipientType, senderRuleVersions: ledgers.filter(l => l.track === "USER").map(l => l.ruleVersion), reason, historicalReceiverXpVerified: false }));
    }
    cursor = gifts.at(-1).id;
  }
  console.log(JSON.stringify({ scanned, counts, writes: 0, warning: "Missing is not automatically eligible. Verify historical recipient mapping, rule version/source, self-gift eligibility and receiver XP at gift time before authorizing a Charm-only correction. Do not replay gift-send or wallet settlement." }));
} finally { await prisma.$disconnect(); }
