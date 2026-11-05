import { notifyAction } from './action-notifications.js';
import { ledgerData } from './wallet.js';

const MAX = 9223372036854775807n;
export const cpError = message => Object.assign(new Error(message), { code: 'VALIDATION_ERROR', status: 422 });
export const activeCpWhere = (now = new Date()) => ({
  type: 'CP', status: 'ACTIVE', leftAcceptedAt: { not: null }, rightAcceptedAt: { not: null },
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});
export function cpProgress(exp, levels) {
  const enabled = levels.filter(row => row.enabled).sort((a, b) => a.level - b.level);
  const current = enabled.filter(row => row.minExp <= exp).at(-1);
  const next = enabled.find(row => row.level > (current?.level ?? 0));
  return {
    level: current?.level ?? 0, levelName: current?.name ?? null, exp: exp.toString(),
    currentLevelExp: (current?.minExp ?? 0n).toString(), nextLevelExp: next?.minExp.toString() ?? null,
    badgeUrl: current?.badgeUrl ?? null, fullAnimationUrl: current?.fullAnimationUrl ?? null,
    fullAnimationMimeType: current?.fullAnimationMimeType ?? null,
    seatEffect: current?.seatEffect ?? null, seatColor: current?.seatColor ?? null,
  };
}
export function cpLevelDto(row) { return { ...row, minExp: row.minExp.toString() }; }
function integer(value, name, minimum = 0n, maximum = MAX) {
  if (!/^\d+$/.test(String(value))) throw cpError(name + ' must be a whole number.');
  const parsed = BigInt(value);
  if (parsed < minimum || parsed > maximum) throw cpError(name + ' is outside the supported range.');
  return parsed;
}
function mediaUrl(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\/[^\s]+$|^\/(?!\/)[^\s]*$/.test(value)) throw cpError('Use an HTTPS media URL or a site-relative path.');
  return value;
}
export function cpLevelInput(body) {
  const level = Number(integer(body.level, 'Level', 1n, 2147483647n));
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 100) throw cpError('Provide a level name of up to 100 characters.');
  if (!/^WAVE_[1-5]$/.test(body.seatEffect)) throw cpError('Choose WAVE_1 through WAVE_5.');
  if (body.seatColor && !/^#[0-9a-f]{6}$/i.test(body.seatColor)) throw cpError('Seat color must be a six-digit hex color.');
  if (typeof body.enabled !== 'boolean') throw cpError('Enabled must be true or false.');
  const fullAnimationUrl = mediaUrl(body.fullAnimationUrl);
  if (fullAnimationUrl && !['application/svga', 'video/mp4'].includes(body.fullAnimationMimeType)) throw cpError('Choose SVGA or MP4 animation media.');
  if (!Array.isArray(body.rewards) || body.rewards.length > 20) throw cpError('Provide up to 20 rewards.');
  const rewards = body.rewards.map(reward => {
    if (!['FRAME','ENTRANCE','BADGE','COINS','ITEM'].includes(reward.kind)) throw cpError('Unsupported CP reward kind.');
    const name = String(reward.name ?? '').trim();
    if (!name || name.length > 100) throw cpError('Each reward needs a name.');
    const result = { kind: reward.kind, name, imageUrl: mediaUrl(reward.imageUrl) };
    if (['COINS','ITEM'].includes(reward.kind)) result.amount = integer(reward.amount, 'Reward amount', 1n, reward.kind === 'ITEM' ? 2147483647n : MAX).toString();
    if (reward.kind !== 'COINS') {
      if (typeof reward.itemId !== 'string' || !reward.itemId.trim()) throw cpError('Choose an uploaded reward item.');
      result.itemId = reward.itemId.trim();
    }
    if (['FRAME','ENTRANCE','BADGE'].includes(reward.kind)) result.days = Number(integer(reward.days, 'Reward duration', 1n, 3650n));
    if (reward.kind === 'ITEM' && reward.days) throw cpError('Backpack items use quantities and do not support a duration.');
    return result;
  });
  return { level, name, minExp: integer(body.minExp, 'Minimum experience'), badgeUrl: mediaUrl(body.badgeUrl),
    fullAnimationUrl, fullAnimationMimeType: fullAnimationUrl ? body.fullAnimationMimeType : null,
    seatEffect: body.seatEffect, seatColor: body.seatColor || null, rewards, enabled: body.enabled };
}
export async function cpRewardAsset(tx, reward) {
  const asset = await tx.uploadAsset.findFirst({ where: { publicId: reward.itemId, active: true }, select: { id: true, category: true } });
  const categories = { FRAME: ['FRAMES'], ENTRANCE: ['ENTRANCES'], BADGE: ['BADGES'], ITEM: ['GIFTS','LIVE_GIFTS'] };
  if (!asset || !categories[reward.kind]?.includes(asset.category)) throw cpError('Reward item is unavailable or has the wrong category.');
  return asset;
}
async function grantReward(tx, userId, reward, key, now) {
  if (reward.kind === 'COINS') {
    const amount = BigInt(reward.amount);
    const updated = await tx.user.updateMany({ where: { id: userId, coinBalance: { lte: MAX - amount } }, data: { coinBalance: { increment: amount } } });
    if (!updated.count) throw cpError('A CP reward exceeds the wallet limit.');
    await tx.walletTransaction.create({ data: ledgerData({ userId, type: 'BONUS', direction: 'CREDIT', title: 'CP level reward', coins: amount, referenceId: key }) });
    return;
  }
  const asset = await cpRewardAsset(tx, reward);
  if (reward.kind === 'ITEM') {
    const amount = Number(reward.amount);
    await tx.userGiftInventory.upsert({ where: { userId_giftAssetId: { userId, giftAssetId: asset.id } },
      create: { userId, giftAssetId: asset.id, quantity: amount }, update: { quantity: { increment: amount } } });
    return;
  }
  const where = { assetId_userId: { assetId: asset.id, userId } };
  const owned = await tx.uploadAssetAssignment.findUnique({ where });
  if (owned && !owned.expiresAt) return;
  if (owned && ['VIP','VIP_TIER','RESELLER','BD','ADMIN','JUNIOR_ADMIN','SENIOR_ADMIN','SUPER_ADMIN','COUNTRY_HEAD'].includes(owned.source)) throw cpError('CP reward overlaps a conditional entitlement. Choose another reward item.');
  const expiresAt = new Date(Math.max(+now, owned?.expiresAt?.getTime() ?? 0) + reward.days * 86400000);
  await tx.uploadAssetAssignment.upsert({ where, create: { assetId: asset.id, userId, source: 'CP_REWARD', sourceReference: key, expiresAt }, update: { expiresAt } });
}
export async function syncCpLevel(tx, relationship, levels, now = new Date()) {
  const exp = relationship.exp ?? 0n;
  const progress = cpProgress(exp, levels);
  const earned = levels.filter(row => row.enabled && row.minExp <= exp).sort((a,b) => a.level - b.level);
  for (const level of earned) {
    const inserted = await tx.cpLevelClaim.createMany({ data: [{ relationshipId: relationship.id, level: level.level, rewards: level.rewards }], skipDuplicates: true });
    if (!inserted.count) continue;
    for (const userId of [relationship.leftUserId, relationship.rightUserId].sort()) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
      const key = `cp:${relationship.id}:level:${level.level}:${userId}`;
      for (const [index, reward] of level.rewards.entries()) await grantReward(tx, userId, reward, key + ':' + index, now);
      await notifyAction(tx, { userId, key, type: 'CP_LEVEL_REWARD', title: 'CP level reached',
        body: `Your CP reached ${level.name}. Your level rewards have been added.`,
        action: { screen: 'CP', relationshipId: relationship.publicId, level: level.level } });
    }
  }
  await tx.profileRelationship.update({ where: { id: relationship.id }, data: { level: progress.level } });
  return progress;
}
export async function awardCpGift(tx, gift, recipient, source) {
  if (['LUCKY','BACKPACK'].includes(source) || !recipient || recipient.id === gift.senderId || gift.reversedAt || gift.coinValue <= 0n) return;
  const [leftUserId, rightUserId] = [gift.senderId, recipient.id].sort();
  const relationship = await tx.profileRelationship.findUnique({ where: { leftUserId_rightUserId_type: { leftUserId, rightUserId, type: 'CP' } } });
  if (!relationship) return;
  await tx.$queryRaw`SELECT id FROM "ProfileRelationship" WHERE id=${relationship.id} FOR UPDATE`;
  const current = await tx.profileRelationship.findFirst({ where: { id: relationship.id, ...activeCpWhere(), startedAt: { lte: gift.createdAt } } });
  if (!current) return;
  const inserted = await tx.cpGiftExperience.createMany({ data: [{ giftId: gift.id, relationshipId: current.id, amount: gift.coinValue }], skipDuplicates: true });
  if (!inserted.count) return;
  if (current.exp + gift.coinValue > MAX) throw cpError('CP experience exceeds the supported range.');
  const updated = await tx.profileRelationship.update({ where: { id: current.id }, data: { exp: { increment: gift.coinValue } } });
  const levels = await tx.cpLevel.findMany({ orderBy: { level: 'asc' } });
  await syncCpLevel(tx, updated, levels);
}
export async function saveCpLevel(tx, body, adminId) {
  const data = cpLevelInput(body);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030154)::text`;
  for (const reward of data.rewards) if (reward.kind !== 'COINS') await cpRewardAsset(tx, reward);
  const other = await tx.cpLevel.findMany({ where: { enabled: true, level: { not: data.level } } });
  if (data.enabled && other.some(row => row.level < data.level ? row.minExp >= data.minExp : row.minExp <= data.minExp)) throw cpError('Enabled thresholds must increase with level.');
  const saved = await tx.cpLevel.upsert({ where: { level: data.level }, create: data, update: data });
  const levels = await tx.cpLevel.findMany({ orderBy: { level: 'asc' } });
  const relationships = await tx.profileRelationship.findMany({ where: activeCpWhere(), orderBy: { id: 'asc' } });
  for (const relationship of relationships) {
    await tx.$queryRaw`SELECT id FROM "ProfileRelationship" WHERE id=${relationship.id} FOR UPDATE`;
    const current = await tx.profileRelationship.findFirst({ where: { id: relationship.id, ...activeCpWhere() } });
    if (current) await syncCpLevel(tx, current, levels);
  }
  await tx.auditLog.create({ data: { adminId, action: 'CP_LEVEL_CONFIGURED', category: 'CONTENT_MANAGEMENT', entityType: 'CpLevel', entityId: String(data.level), description: 'Updated CP level configuration.', metadata: cpLevelDto(saved) } });
  return saved;
}
