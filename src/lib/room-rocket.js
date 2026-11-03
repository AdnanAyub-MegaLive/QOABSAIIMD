import { randomInt, randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';
import { appendOutbox } from './progression.js';
import { ledgerData } from './wallet.js';
import { notifyAction } from './action-notifications.js';
import { hasVipPrivilege } from './vip-capabilities.js';
import { equippablePropCategories } from './props-store.js';
import { decorationMedia } from './decoration-media.js';
import { allocateRocketCoins, drawRocketWinners, rocketError, rocketJson, rocketPercentage, validateRocketConfig } from './room-rocket-contract.js';

const stageKey = (campaignId, roomId, level, userId) => ({ campaignId_roomId_level_userId: { campaignId, roomId, level, userId } });
const publicUser = user => ({ publicId: user.publicId, name: user.name, profileImage: user.profileImage });
const eligibleUser = now => ({ status: 'ACTIVE', deletedAt: null, companyBdCountry: null, bans: { none: { target: 'USER', revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } });

export async function saveRocketConfiguration(tx, input, now = new Date()) {
  const config = validateRocketConfig(input);
  // Serialize configuration publish against season rollover only, never every gift.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030147)::text`;
  const previous = await tx.roomRocketSeason.findFirst({ orderBy: { endsAt: 'desc' } });
  if (!previous && config.enabled && new Date(config.endsAt) <= now) throw rocketError('VALIDATION_ERROR', 'The first season must end in the future.');
  for (const stage of config.stages) {
    if (config.enabled && (!stage.thumbnailUrl || !stage.animation.mediaUrl)) throw rocketError('VALIDATION_ERROR', 'Each enabled level needs a rocket picture and launch animation.');
    for (const reward of Object.values(stage.rewards).flat()) {
      if (reward.type === 'COINS') continue;
      const asset = await tx.uploadAsset.findUnique({ where: { publicId: reward.assetId } });
      if (!asset?.active || (reward.type === 'PROP' ? !equippablePropCategories.has(asset.category) : asset.category !== 'GIFTS')) throw rocketError('VALIDATION_ERROR', 'Choose an active gift or equippable prop matching the reward type.');
      reward.internalAssetId = asset.id;
      reward.category = asset.category;
      reward.name = asset.name;
      reward.text = `${asset.name} Ã— ${reward.amount} ${reward.type === 'PROP' ? 'days' : 'gifts'}`;
    }
  }
  await tx.roomRocketSettings.upsert({ where: { id: 'GLOBAL' }, create: { id: 'GLOBAL', enabled: config.enabled, config }, update: { enabled: config.enabled, config } });
  if (config.enabled) await currentRocketSeason(tx, now);
  return config;
}

export async function currentRocketSeason(tx, now = new Date()) {
  const settings = await tx.roomRocketSettings.findUnique({ where: { id: 'GLOBAL' } });
  if (!settings?.enabled) return null;
  let latest = await tx.roomRocketSeason.findFirst({ orderBy: { endsAt: 'desc' } });
  if (latest?.endsAt > now) return latest;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030147)::text`;
  // A concurrent publisher or worker may have created this season while we waited.
  const fresh = await tx.roomRocketSettings.findUnique({ where: { id: 'GLOBAL' } });
  if (!fresh?.enabled) return null;
  latest = await tx.roomRocketSeason.findFirst({ orderBy: { endsAt: 'desc' } });
  if (latest?.endsAt > now) return latest;
  const config = fresh.config;
  let startsAt = latest?.endsAt ?? now;
  let endsAt = latest ? new Date(startsAt.getTime() + config.repeatDays * 86400000) : new Date(config.endsAt);
  if (endsAt <= now) {
    const interval = config.repeatDays * 86400000;
    const skipped = Math.floor((now.getTime() - endsAt.getTime()) / interval) + 1;
    endsAt = new Date(endsAt.getTime() + skipped * interval);
    startsAt = new Date(endsAt.getTime() - interval);
  }
  return tx.roomRocketSeason.create({ data: { id: `ROCKET-${randomUUID()}`, startsAt, endsAt, config } });
}

async function lockProgress(tx, roomId, season) {
  await tx.roomRocketProgress.upsert({ where: { roomId }, create: { roomId, campaignId: season.id }, update: {} });
  await tx.$queryRaw`SELECT "roomId" FROM "RoomRocketProgress" WHERE "roomId"=${roomId} FOR UPDATE`;
  let progress = await tx.roomRocketProgress.findUniqueOrThrow({ where: { roomId } });
  if (progress.campaignId !== season.id) progress = await tx.roomRocketProgress.update({ where: { roomId }, data: { campaignId: season.id, level: 1, coins: 0n, revision: { increment: 1 }, dirty: true } });
  return progress;
}

async function topContributors(tx, roomId, campaignId, level, now = new Date()) {
  // Rank only real, active accounts. Score ties use stable internal identity order.
  const rows = await tx.$queryRaw`SELECT c."userId", c.coins, u."publicId", u.name, u."profileImage",
    (SELECT p."currentLevel" FROM "UserProgress" p WHERE p."userId"=u.id AND p.track='USER') AS level,
    (SELECT json_build_object('publicId',a."publicId",'mimeType',a."mimeType",'mediaVersion',a."mediaVersion")
      FROM "UserEquippedProp" e JOIN "UploadAsset" a ON a.id=e."assetId"
      WHERE e."userId"=u.id AND e.category='FRAMES' AND a.active=true AND
      (a."isGlobal"=true OR EXISTS(SELECT 1 FROM "UploadAssetAssignment" x WHERE x."assetId"=a.id AND x."userId"=u.id AND (x."expiresAt" IS NULL OR x."expiresAt">CURRENT_TIMESTAMP))) LIMIT 1) AS frame
    FROM "RoomRocketContribution" c JOIN "User" u ON u.id=c."userId"
    WHERE c."roomId"=${roomId} AND c."campaignId"=${campaignId} AND c.level=${level} AND c.coins>0
    AND u.status='ACTIVE' AND u."deletedAt" IS NULL AND u."companyBdCountry" IS NULL
    AND NOT EXISTS(SELECT 1 FROM "Ban" b WHERE b."userId"=u.id AND b.target='USER' AND b."revokedAt" IS NULL AND (b."expiresAt" IS NULL OR b."expiresAt">${now}))
    ORDER BY c.coins DESC, c."userId" ASC LIMIT 3`;
  return rows.map((r, i) => ({ userId: r.userId, rank: i + 1, totalCoins: String(r.coins), user: { ...publicUser(r), level: r.level ?? 0, frameUrl: r.frame ? decorationMedia(r.frame, process.env.MOBILE_API_BASE_URL || process.env.AUTH_URL || 'http://localhost:3000').url : null } }));
}

async function launchRocket(tx, roomId, season, level, now) {
  const stage = season.config.stages[level - 1];
  const top = await topContributors(tx, roomId, season.id, level, now);
  const winners = top.map(r => ({ userId: r.userId, rank: r.rank, group: `top${r.rank}`, rewards: stage.rewards[`top${r.rank}`] }));
  if (stage.inRoomWinners && stage.rewards.inRoom.length) {
    const io = globalThis.portalIo;
    if (!io) throw rocketError('ROCKET_PRESENCE_UNAVAILABLE', 'Room presence is temporarily unavailable. Retry with the same gift request ID.', 503);
    const sockets = await io.in(`audio-room:${roomId}`).fetchSockets();
    const ids = [...new Set(sockets.filter(s => s.data?.audioPresenceLeaseUntil > now.getTime()).map(s => s.data.internalUserId).filter(Boolean))];
    const members = await tx.audioRoomMember.findMany({ where: { audioRoom: { roomId }, socketCount: { gt: 0 }, userId: { in: ids }, user: eligibleUser(now) }, select: { userId: true } });
    const visible = [];
    for (const member of members) if (!await hasVipPrivilege(member.userId, 'INVISIBLE_ENTRY', tx)) visible.push(member.userId);
    for (const userId of drawRocketWinners(visible, top.map(r => r.userId), stage.inRoomWinners)) winners.push({ userId, rank: null, group: 'inRoom', rewards: [stage.rewards.inRoom[randomInt(stage.rewards.inRoom.length)]] });
  }
  const id = `LAUNCH-${randomUUID()}`;
  const topContributor = top[0]?.user ?? null;
  await tx.roomRocketLaunch.create({ data: { id, roomId, campaignId: season.id, level, winners, ...(topContributor ? { topContributor } : {}), createdAt: now } });
  await appendOutbox(tx, `audio-room:${roomId}`, 'audio-room:rocket:launch', { roomId, eventId: id, launchId: id, campaignId: season.id, stageId: stage.id, level, topContributor, animation: stage.animation });
}

export async function recordRocketGift(tx, gift, source, now = new Date()) {
  if (!gift.roomId || gift.liveSessionId || source === 'BACKPACK' || gift.reversedAt || BigInt(gift.coinValue) <= 0n) return;
  const season = await currentRocketSeason(tx, now);
  if (!season || gift.createdAt < season.startsAt || gift.createdAt >= season.endsAt) return;
  const p = await lockProgress(tx, gift.roomId, season);
  if (await tx.roomRocketGift.findUnique({ where: { giftId: gift.id } })) return;
  const next = allocateRocketCoins(season.config.stages, p.level, p.coins, gift.coinValue);
  for (const allocation of next.allocations) {
    const key = stageKey(season.id, gift.roomId, allocation.level, gift.senderId);
    await tx.roomRocketContribution.upsert({ where: key, create: { campaignId: season.id, roomId: gift.roomId, level: allocation.level, userId: gift.senderId, coins: allocation.amount }, update: { coins: { increment: allocation.amount } } });
    if (allocation.launch) await launchRocket(tx, gift.roomId, season, allocation.level, now);
  }
  await tx.roomRocketGift.create({ data: { giftId: gift.id, roomId: gift.roomId, campaignId: season.id, senderId: gift.senderId, allocations: rocketJson(next.allocations) } });
  if (next.allocations.length) await tx.roomRocketProgress.update({ where: { roomId: gift.roomId }, data: { level: next.level, coins: next.currentCoins, revision: { increment: 1 }, dirty: true } });
}

export async function reverseRocketGift(tx, giftId, now = new Date()) {
  const gift = await tx.roomRocketGift.findUnique({ where: { giftId } });
  if (!gift || gift.reversedAt) return;
  await tx.$queryRaw`SELECT "roomId" FROM "RoomRocketProgress" WHERE "roomId"=${gift.roomId} FOR UPDATE`;
  const p = await tx.roomRocketProgress.findUnique({ where: { roomId: gift.roomId } });
  const season = await tx.roomRocketSeason.findUnique({ where: { id: gift.campaignId } });
  if (p?.campaignId === gift.campaignId && season.endsAt > now) {
    const allocation = gift.allocations.find(a => a.level === p.level);
    const launched = await tx.roomRocketLaunch.findUnique({ where: { campaignId_roomId_level: { campaignId: p.campaignId, roomId: gift.roomId, level: p.level } } });
    if (allocation && !launched) {
      const amount = BigInt(allocation.amount);
      const c = await tx.roomRocketContribution.findUnique({ where: stageKey(p.campaignId, gift.roomId, p.level, gift.senderId) });
      await tx.roomRocketContribution.update({ where: stageKey(p.campaignId, gift.roomId, p.level, gift.senderId), data: { coins: c.coins > amount ? c.coins - amount : 0n } });
      await tx.roomRocketProgress.update({ where: { roomId: gift.roomId }, data: { coins: p.coins > amount ? p.coins - amount : 0n, revision: { increment: 1 }, dirty: true } });
    }
  }
  await tx.roomRocketGift.update({ where: { giftId }, data: { reversedAt: now } });
}

export async function rocketSnapshot(tx, roomId, now = new Date()) {
  const season = await currentRocketSeason(tx, now);
  if (!season) return null;
  const p = await lockProgress(tx, roomId, season), stage = season.config.stages[p.level - 1];
  const top = await topContributors(tx, roomId, season.id, p.level, now);
  return { roomId, serverTime: now.toISOString(), campaign: { id: season.id, title: season.config.title, rules: season.config.rules, endsAt: season.endsAt.toISOString() }, progress: { stageId: stage.id, level: p.level, currentCoins: String(p.coins), targetCoins: stage.targetCoins, percentage: rocketPercentage(p.coins, stage.targetCoins), revision: p.revision }, stages: season.config.stages.map(s => ({ ...s, completed: s.level < p.level || (s.level === p.level && p.coins >= BigInt(s.targetCoins)) })), topContributors: top.map(({ userId, ...row }) => row) };
}

export async function rocketJoinSummary(roomId, db = prisma) {
  const snapshot = await db.$transaction(tx => rocketSnapshot(tx, roomId));
  return snapshot ? { enabled: true, campaignId: snapshot.campaign.id, stageId: snapshot.progress.stageId } : { enabled: false };
}

export async function displayRocketRewards(tx, rewards, requestOrigin) {
  const output = [];
  for (const r of rewards) {
    const { internalAssetId, ...publicReward } = r;
    const asset = internalAssetId ? await tx.uploadAsset.findUnique({ where: { id: internalAssetId } }) : null;
    const media = asset ? decorationMedia(asset, requestOrigin) : null;
    output.push({ ...publicReward, iconUrl: media?.posterUrl ?? media?.url ?? r.iconUrl ?? null });
  }
  return output;
}

export async function payRocketLaunch(tx, id, now = new Date()) {
  await tx.$queryRaw`SELECT id FROM "RoomRocketLaunch" WHERE id=${id} FOR UPDATE`;
  const launch = await tx.roomRocketLaunch.findUniqueOrThrow({ where: { id } });
  if (launch.paidAt) return false;
  // One recipient per transaction: completed recipients survive a later job retry.
  const paid = launch.paidUserIds ?? [];
  const winner = launch.winners.find(w => !paid.includes(w.userId));
  if (winner) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${winner.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: winner.userId } });
    for (const reward of winner.rewards) {
      if (reward.type === 'COINS') {
        await tx.user.update({ where: { id: user.id }, data: { coinBalance: { increment: BigInt(reward.amount) } } });
        await tx.walletTransaction.create({ data: ledgerData({ userId: user.id, type: 'ROCKET_REWARD', direction: 'CREDIT', title: 'Rocket reward', coins: BigInt(reward.amount), referenceId: `${id}:${user.id}:${reward.rewardId}`, metadata: { launchId: id, roomId: launch.roomId } }) });
        // The existing wallet trigger queues the authoritative balance/revision event.
      } else if (reward.type === 'PROP') {
        const where = { assetId_userId: { assetId: reward.internalAssetId, userId: user.id } };
        const existing = await tx.uploadAssetAssignment.findUnique({ where });
        if (!existing || existing.expiresAt) {
          const base = existing?.expiresAt > now ? existing.expiresAt : now;
          const expiresAt = new Date(base.getTime() + Number(reward.amount) * 86400000);
          await tx.uploadAssetAssignment.upsert({ where, create: { assetId: reward.internalAssetId, userId: user.id, expiresAt, durationMinutes: Number(reward.amount) * 1440, source: 'ROOM_ROCKET', sourceReference: id }, update: { expiresAt } });
          await appendOutbox(tx, `user:${user.publicId}`, 'props:granted', { assetId: reward.assetId, expiresAt, launchId: id });
        }
      } else {
        await tx.userGiftInventory.upsert({ where: { userId_giftAssetId: { userId: user.id, giftAssetId: reward.internalAssetId } }, create: { userId: user.id, giftAssetId: reward.internalAssetId, quantity: Number(reward.amount) }, update: { quantity: { increment: Number(reward.amount) } } });
        await appendOutbox(tx, `user:${user.publicId}`, 'backpack:updated', { giftId: reward.assetId, launchId: id });
      }
    }
    if (winner.rewards.length) await notifyAction(tx, { userId: user.id, key: `rocket:${id}`, type: 'ROOM_ROCKET', title: 'Room Rocket reward', body: `You won ${winner.rewards.map(r => r.text).join(', ')} from Room Rocket`, action: { screen: 'ROOM_ROCKET_RESULTS', roomId: launch.roomId, campaignId: launch.campaignId, stageId: `LV-${launch.level}` } });
  }
  const paidUserIds = winner ? [...paid, winner.userId] : paid;
  await tx.roomRocketLaunch.update({ where: { id }, data: { paidUserIds, ...(paidUserIds.length >= launch.winners.length ? { paidAt: now } : {}) } });
  return true;
}

export async function maintainRoomRocketRewards(db = prisma) {
  // Pending rewards belong to completed launches: disabling cannot erase earned rewards.
  const jobs = await db.roomRocketLaunch.findMany({ where: { paidAt: null }, orderBy: { createdAt: 'asc' }, take: 10 });
  for (const job of jobs) {
    try { await db.$transaction(tx => payRocketLaunch(tx, job.id), { isolationLevel: 'Serializable', timeout: 20000 }); }
    catch (error) { console.error('Room Rocket payout deferred', { launchId: job.id, code: error.code ?? 'FAILED' }); }
  }
}

export async function maintainRoomRockets(db = prisma) {
  const season = await db.$transaction(tx => currentRocketSeason(tx));
  if (!season) return;
  const rooms = await db.roomRocketProgress.findMany({ where: { OR: [{ campaignId: { not: season.id } }, { dirty: true, OR: [{ emittedAt: null }, { emittedAt: { lte: new Date(Date.now() - 500) } }] }] }, take: 50, orderBy: [{ emittedAt: { sort: 'asc', nulls: 'first' } }, { roomId: 'asc' }] });
  for (const row of rooms) await db.$transaction(async tx => {
    const snapshot = await rocketSnapshot(tx, row.roomId);
    if (!snapshot) return;
    const p = await tx.roomRocketProgress.findUnique({ where: { roomId: row.roomId } });
    if (!p.dirty || (p.emittedAt && p.emittedAt.getTime() > Date.now() - 500)) return;
    await appendOutbox(tx, `audio-room:${row.roomId}`, 'audio-room:rocket:progress', { roomId: row.roomId, campaignId: snapshot.campaign.id, ...snapshot.progress, topContributors: snapshot.topContributors });
    await tx.roomRocketProgress.update({ where: { roomId: row.roomId }, data: { dirty: false, emittedAt: new Date() } });
  });
}
