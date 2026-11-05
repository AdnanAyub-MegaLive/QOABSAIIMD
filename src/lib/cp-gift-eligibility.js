// CP gifts require independent active relationships, not a shared partnership.
export async function assertCpGiftEligible(tx, gift, senderId, recipientIds, now = new Date()) {
  if (gift.giftCategory !== 'CP_GIFT') return;
  const ids = [...new Set([senderId, ...recipientIds])];
  const relationships = await tx.profileRelationship.findMany({
    where: {
      type: 'CP', status: 'ACTIVE', leftAcceptedAt: { not: null }, rightAcceptedAt: { not: null },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [{ OR: [{ leftUserId: { in: ids } }, { rightUserId: { in: ids } }] }],
      left: { status: 'ACTIVE', deletedAt: null }, right: { status: 'ACTIVE', deletedAt: null },
    },
    select: { leftUserId: true, rightUserId: true },
  });
  const eligible = new Set(relationships.flatMap(row => [row.leftUserId, row.rightUserId]));
  if (ids.some(id => !eligible.has(id))) {
    throw Object.assign(new Error('CP Gifts require the sender and every recipient to have an active CP relationship.'), {
      code: 'CP_GIFT_RELATIONSHIP_REQUIRED', status: 403,
    });
  }
}
