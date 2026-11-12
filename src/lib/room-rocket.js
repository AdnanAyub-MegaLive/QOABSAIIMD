import { queueRocketAnnouncement } from './global-announcements.js';
import { randomInt, randomUUID } from 'node:crypto';
import { prisma } from './prisma.js';
import { appendOutbox } from './progression.js';
import { ledgerData } from './wallet.js';
import { notifyAction } from './action-notifications.js';
import { hasVipPrivilege } from './vip-capabilities.js';
import { equippablePropCategories } from './props-store.js';
import { decorationMedia } from './decoration-media.js';
import { drawRocketWinners, rocketError, rocketPercentage, validateRocketConfig } from './room-rocket-contract.js';

const stageKey = (campaignId, roomId, cycle, level, userId) => ({ campaignId_roomId_cycle_level_userId: { campaignId, roomId, cycle, level, userId } });
const publicUser = user => ({ publicId: user.publicId, name: user.name, profileImage: user.profileImage });
const eligibleUser = now => ({ status: 'ACTIVE', deletedAt: null, companyBdCountry: null, bans: { none: { target: 'USER', revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } });

export async function saveRocketConfiguration(tx, input, now = new Date()) {
  const config = validateRocketConfig(input);
  // Serialize configuration publish against season rollover only, never every gift.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030147)::text`;
  const previous = await tx.roomRocketSeason.findFirst({ orderBy: { endsAt: 'desc' } });
  if (config.enabled && previous?.endsAt > now && previous.config.stages.some(s => s.inRoomWinners > 0 && config.grabWindowSeconds < Math.ceil(s.animation.durationMs / 1000) + 7)) throw rocketError('VALIDATION_ERROR', 'The grab window must also cover the current season animation, countdown, button and network delay.');
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
  if (previous?.endsAt > now && (previous.config.rules !== config.rules || previous.config.resetDelayMinutes !== config.resetDelayMinutes || previous.config.grabWindowSeconds !== config.grabWindowSeconds)) {
    await tx.roomRocketSeason.update({ where: { id: previous.id }, data: { config: { ...previous.config, rules: config.rules, resetDelayMinutes: config.resetDelayMinutes, grabWindowSeconds: config.grabWindowSeconds } } });
  }
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
  const where = { campaignId_roomId: { campaignId: season.id, roomId } };
  const existing = await tx.roomRocketProgress.findUnique({ where });
  if (!existing) {
    const latest = await tx.roomRocketProgress.findFirst({ where: { roomId }, orderBy: { revision: 'desc' }, select: { revision: true } });
    await tx.roomRocketProgress.upsert({ where, create: { roomId, campaignId: season.id, revision: latest ? latest.revision + 1 : 0 }, update: {} });
  }
  await tx.$queryRaw`SELECT "roomId" FROM "RoomRocketProgress" WHERE "roomId"=${roomId} AND "campaignId"=${season.id} FOR UPDATE`;
  return tx.roomRocketProgress.findUniqueOrThrow({ where });
}

async function topContributors(tx, roomId, campaignId, level, cycle, now = new Date()) {
  // Rank only real, active accounts. Score ties use stable internal identity order.
  const rows = await tx.$queryRaw`SELECT c."userId", c.coins, u."publicId", u.name, u."profileImage",
    (SELECT p."currentLevel" FROM "UserProgress" p WHERE p."userId"=u.id AND p.track='USER') AS level,
    (SELECT json_build_object('publicId',a."publicId",'mimeType',a."mimeType",'mediaVersion',a."mediaVersion")
      FROM "UserEquippedProp" e JOIN "UploadAsset" a ON a.id=e."assetId"
      WHERE e."userId"=u.id AND e.category='FRAMES' AND a.active=true AND
      (a."isGlobal"=true OR EXISTS(SELECT 1 FROM "UploadAssetAssignment" x WHERE x."assetId"=a.id AND x."userId"=u.id AND (x."expiresAt" IS NULL OR x."expiresAt">CURRENT_TIMESTAMP))) LIMIT 1) AS frame
    FROM "RoomRocketContribution" c JOIN "User" u ON u.id=c."userId"
    WHERE c."roomId"=${roomId} AND c."campaignId"=${campaignId} AND c.level=${level} AND c.cycle=${cycle} AND c.coins>0
    AND u.status='ACTIVE' AND u."deletedAt" IS NULL AND u."companyBdCountry" IS NULL
    AND NOT EXISTS(SELECT 1 FROM "Ban" b WHERE b."userId"=u.id AND b.target='USER' AND b."revokedAt" IS NULL AND (b."expiresAt" IS NULL OR b."expiresAt">${now}))
    ORDER BY c.coins DESC, c."userId" ASC LIMIT 3`;
  return rows.map((r, i) => ({ userId: r.userId, rank: i + 1, totalCoins: String(r.coins), user: { ...publicUser(r), level: r.level ?? 0, frameUrl: r.frame ? decorationMedia(r.frame, process.env.MOBILE_API_BASE_URL || process.env.AUTH_URL || 'http://localhost:3000').url : null } }));
}

export async function rocketVisibleMembers(tx, roomId, now, onlyUserId) {
    const io = globalThis.portalIo;
    if (!io) throw rocketError('ROCKET_PRESENCE_UNAVAILABLE', 'Room presence is temporarily unavailable. Retry with the same gift request ID.', 503);
    const sockets = await io.in(`audio-room:${roomId}`).fetchSockets();
    const ids = [...new Set(sockets.filter(s => s.data?.audioPresenceLeaseUntil > now.getTime()).map(s => s.data.internalUserId).filter(id => id && (!onlyUserId || id === onlyUserId)))];
    if (!ids.length) return [];
    const members = await tx.audioRoomMember.findMany({ where: { audioRoom: { roomId }, socketCount: { gt: 0 }, userId: { in: ids }, user: eligibleUser(now) }, select: { userId: true } });
    const visible = [];
    for (const member of members) if (!await hasVipPrivilege(member.userId, 'INVISIBLE_ENTRY', tx)) visible.push(member.userId);
    return visible;
}

async function launchRocket(tx, roomId, season, level, cycle, now) {
  const stage = season.config.stages[level - 1];
  const top = await topContributors(tx, roomId, season.id, level, cycle, now);
  const winners = top.map(r => ({ userId: r.userId, rank: r.rank, group: `top${r.rank}`, rewards: stage.rewards[`top${r.rank}`] }));
  const fallbackWinners = [];
  if (stage.inRoomWinners && stage.rewards.inRoom.length) {
    const visible = await rocketVisibleMembers(tx, roomId, now);
    for (const userId of drawRocketWinners(visible, top.map(r => r.userId), stage.inRoomWinners)) fallbackWinners.push({ userId, rank: null, group: 'inRoom', rewards: [stage.rewards.inRoom[randomInt(stage.rewards.inRoom.length)]] });
  }
  const grabWindowSeconds = season.config.grabWindowSeconds ?? 30;
  const grabClosesAt = new Date(+now + grabWindowSeconds * 1000);
  const id = `LAUNCH-${randomUUID()}`;
  const topContributor = top[0]?.user ?? null;
  const resetAt = level===season.config.stages.length ? new Date(now.getTime()+(season.config.resetDelayMinutes ?? 180)*60000) : null;
  await tx.roomRocketLaunch.create({ data: { id, roomId, campaignId: season.id, level, cycle, resetAt, winners, grabWindowSeconds, grabClosesAt, inRoomWinners: stage.inRoomWinners, inRoomRewards: stage.rewards.inRoom, fallbackWinners, ...(topContributor ? { topContributor } : {}), createdAt: now } });
  await appendOutbox(tx, `audio-room:${roomId}`, 'audio-room:rocket:launch', { roomId, eventId: id, launchId: id, campaignId: season.id, stageId: stage.id, level, cycle, grabWindowSeconds, grabClosesAt: grabClosesAt.toISOString(), inRoomWinners: stage.inRoomWinners, cooldownUntil: resetAt ? null : new Date(now.getTime()+180000).toISOString(), resetAt: resetAt?.toISOString() ?? null, topContributor, animation: stage.animation });
  await queueRocketAnnouncement(tx, id, roomId, level, top[0]?.userId, now);
}

export async function enqueueRocketGift(tx, gift, source, now = new Date()) {
  if (!gift.roomId || gift.liveSessionId || source === 'BACKPACK' || gift.reversedAt || BigInt(gift.coinValue) <= 0n) return;
  const season = await currentRocketSeason(tx, now);
  if (!season || gift.createdAt < season.startsAt || gift.createdAt >= season.endsAt) return;
  await tx.roomRocketPendingGift.create({ data: { giftId: gift.id, campaignId: season.id } });
}

async function drainRocketGifts(db) {
  for (let count = 0; count < 100; count++) {
    const processed = await db.$transaction(async tx => {
      const [job] = await tx.$queryRaw`SELECT * FROM "RoomRocketPendingGift" ORDER BY seq LIMIT 1 FOR UPDATE`;
      if (!job) return false;
      // Serialize against a refund updating this gift before it reverses allocations.
      await tx.$queryRaw`SELECT id FROM "GiftTransaction" WHERE id=${job.giftId} FOR UPDATE`;
      const gift = await tx.giftTransaction.findUniqueOrThrow({ where: { id: job.giftId } });
      const season = await tx.roomRocketSeason.findUniqueOrThrow({ where: { id: job.campaignId } });
      await recordRocketGift(tx, gift, "COINS", new Date(), season);
      await tx.roomRocketPendingGift.delete({ where: { giftId: job.giftId } });
      return true;
    });
    if (!processed) break;
  }
}

// The progress row lock serializes gifts, timers, refunds and repeated worker runs.
// Credits retain sender attribution and FIFO order while a launch is paused.
async function advanceRocket(tx, roomId, season, p, now) {
  const where={campaignId_roomId:{campaignId:season.id,roomId}};
  if(p.resetAt){
    if(p.resetAt>now)return p;
    p=await tx.roomRocketProgress.update({where,data:{cycle:p.cycle+1,cycleStartedAt:p.resetAt,level:1,coins:0n,cooldownUntil:null,resetAt:null,revision:{increment:1},dirty:true}});
  }
  for(let pass=0;pass<2;pass++){
    const target=BigInt(season.config.stages[p.level-1].targetCoins);
    const credits=await tx.roomRocketCredit.findMany({where:{campaignId:season.id,roomId},orderBy:{seq:'asc'},take:100});
    for(const credit of credits){
      if(p.coins>=target)break;
      const amount=credit.coins < target-p.coins ? credit.coins : target-p.coins;
      const key=stageKey(season.id,roomId,p.cycle,p.level,credit.senderId);
      await tx.roomRocketContribution.upsert({where:key,create:{campaignId:season.id,roomId,cycle:p.cycle,level:p.level,userId:credit.senderId,coins:amount},update:{coins:{increment:amount}}});
      const receipt=await tx.roomRocketGift.findUniqueOrThrow({where:{giftId:credit.giftId}});
      const allocations=[...receipt.allocations];
      const prior=allocations.find(a=>(a.cycle??0)===p.cycle && a.level===p.level);
      if(prior)prior.amount=String(BigInt(prior.amount)+amount);else allocations.push({cycle:p.cycle,level:p.level,amount:String(amount)});
      await tx.roomRocketGift.update({where:{giftId:credit.giftId},data:{allocations}});
      if(amount===credit.coins)await tx.roomRocketCredit.delete({where:{giftId:credit.giftId}});
      else await tx.roomRocketCredit.update({where:{giftId:credit.giftId},data:{coins:credit.coins-amount}});
      p=await tx.roomRocketProgress.update({where,data:{coins:p.coins+amount,revision:{increment:1},dirty:true}});
    }
    if(p.cooldownUntil && p.cooldownUntil<=now)p=await tx.roomRocketProgress.update({where,data:{cooldownUntil:null,revision:{increment:1},dirty:true}});
    if(p.coins<target || p.cooldownUntil || pass===1)break;
    await launchRocket(tx,roomId,season,p.level,p.cycle,now);
    if(p.level===season.config.stages.length){
      // No carryover across a final launch: only gifts after the reset qualify.
      await tx.roomRocketCredit.deleteMany({where:{campaignId:season.id,roomId}});
      p=await tx.roomRocketProgress.update({where,data:{resetAt:new Date(now.getTime()+(season.config.resetDelayMinutes??180)*60000),cooldownUntil:null,revision:{increment:1},dirty:true}});
      break;
    }
    p=await tx.roomRocketProgress.update({where,data:{level:p.level+1,coins:0n,cooldownUntil:new Date(now.getTime()+180000),revision:{increment:1},dirty:true}});
  }
  return p;
}

export async function recordRocketGift(tx, gift, source, now = new Date(), assignedSeason) {
  if (!gift.roomId || gift.liveSessionId || source === 'BACKPACK' || gift.reversedAt || BigInt(gift.coinValue) <= 0n) return;
  const season = assignedSeason ?? await currentRocketSeason(tx, now);
  if (!season || gift.createdAt < season.startsAt || gift.createdAt >= season.endsAt) return;
  let p = await lockProgress(tx, gift.roomId, season);
  if (await tx.roomRocketGift.findUnique({ where: { giftId: gift.id } })) return;
  // Preserve the original gift time when processing a delayed job after reset.
  const excluded=(p.resetAt && gift.createdAt<p.resetAt) || (p.cycleStartedAt && gift.createdAt<p.cycleStartedAt);
  p=await advanceRocket(tx,gift.roomId,season,p,now);
  if(excluded || p.resetAt || (p.cycleStartedAt && gift.createdAt<p.cycleStartedAt))return;
  await tx.roomRocketGift.create({data:{giftId:gift.id,roomId:gift.roomId,campaignId:season.id,senderId:gift.senderId,allocations:[]}});
  await tx.roomRocketCredit.create({data:{giftId:gift.id,roomId:gift.roomId,campaignId:season.id,senderId:gift.senderId,coins:BigInt(gift.coinValue)}});
  p=await tx.roomRocketProgress.update({where:{campaignId_roomId:{campaignId:season.id,roomId:gift.roomId}},data:{revision:{increment:1},dirty:true}});
  await advanceRocket(tx,gift.roomId,season,p,now);
}

export async function reverseRocketGift(tx, giftId, now = new Date()) {
  let gift = await tx.roomRocketGift.findUnique({ where: { giftId } });
  if (!gift || gift.reversedAt) return;
  await tx.$queryRaw`SELECT "roomId" FROM "RoomRocketProgress" WHERE "roomId"=${gift.roomId} AND "campaignId"=${gift.campaignId} FOR UPDATE`;
  gift = await tx.roomRocketGift.findUnique({where:{giftId}});
  if(gift.reversedAt)return;
  await tx.roomRocketCredit.deleteMany({where:{giftId}});
  const p = await tx.roomRocketProgress.findUnique({ where: { campaignId_roomId: { campaignId: gift.campaignId, roomId: gift.roomId } } });
  const season = await tx.roomRocketSeason.findUnique({ where: { id: gift.campaignId } });
  if (p?.campaignId === gift.campaignId && season.endsAt > now) {
    const allocation = gift.allocations.find(a => a.level === p.level && (a.cycle??0)===p.cycle);
    const launched = await tx.roomRocketLaunch.findUnique({ where: { campaignId_roomId_cycle_level: { campaignId: p.campaignId, roomId: gift.roomId, cycle:p.cycle, level: p.level } } });
    if (allocation && !launched) {
      const amount = BigInt(allocation.amount);
      const c = await tx.roomRocketContribution.findUnique({ where: stageKey(p.campaignId, gift.roomId, p.cycle, p.level, gift.senderId) });
      await tx.roomRocketContribution.update({ where: stageKey(p.campaignId, gift.roomId, p.cycle, p.level, gift.senderId), data: { coins: c.coins > amount ? c.coins - amount : 0n } });
      await tx.roomRocketProgress.update({ where: { campaignId_roomId: { campaignId: gift.campaignId, roomId: gift.roomId } }, data: { coins: p.coins > amount ? p.coins - amount : 0n, revision: { increment: 1 }, dirty: true } });
    }
  }
  if(p)await tx.roomRocketProgress.update({where:{campaignId_roomId:{campaignId:gift.campaignId,roomId:gift.roomId}},data:{revision:{increment:1},dirty:true}});
  await tx.roomRocketGift.update({ where: { giftId }, data: { reversedAt: now } });
}

export async function rocketSnapshot(tx, roomId, now = new Date()) {
  const season = await currentRocketSeason(tx, now);
  if (!season) return null;
  const p = await advanceRocket(tx,roomId,season,await lockProgress(tx,roomId,season),now), stage = season.config.stages[p.level - 1];
  const queued = await tx.roomRocketCredit.aggregate({where:{campaignId:season.id,roomId},_sum:{coins:true}});
  const top = await topContributors(tx, roomId, season.id, p.level, p.cycle, now);
  const passengers = p.resetAt ? [] : await tx.$queryRaw`SELECT u."publicId", u.name, u."profileImage"
    FROM "RoomRocketContribution" c JOIN "User" u ON u.id=c."userId"
    WHERE c."roomId"=${roomId} AND c."campaignId"=${season.id} AND c.level=${p.level} AND c.cycle=${p.cycle}
      AND c.coins>0 AND u.status='ACTIVE' AND u."deletedAt" IS NULL
      AND u."companyBdCountry" IS NULL AND NOT EXISTS(SELECT 1 FROM "Ban" b WHERE b."userId"=u.id AND b.target='USER' AND b."revokedAt" IS NULL AND (b."expiresAt" IS NULL OR b."expiresAt">${now}))
    ORDER BY c.coins DESC, c."userId"`;
  return { passengers, roomId, serverTime: now.toISOString(), campaign: { id: season.id, title: season.config.title, rules: season.config.rules, endsAt: season.endsAt.toISOString() }, progress: { cycle:p.cycle, cooldownUntil:p.cooldownUntil?.toISOString()??null, resetAt:p.resetAt?.toISOString()??null, queuedCoins:String(queued._sum.coins??0n), stageId: stage.id, level: p.level, currentCoins: String(p.coins), targetCoins: stage.targetCoins, percentage: rocketPercentage(p.coins, stage.targetCoins), revision: p.revision }, stages: season.config.stages.map(s => ({ ...s, completed: s.level < p.level || (s.level === p.level && Boolean(p.resetAt)) })), topContributors: top.map(({ userId, ...row }) => row) };
}

export async function rocketJoinSummary(roomId, db = prisma) {
  const snapshot = await db.$transaction(tx => rocketSnapshot(tx, roomId));
  return snapshot ? { enabled: true, campaignId: snapshot.campaign.id, stageId: snapshot.progress.stageId, cycle:snapshot.progress.cycle } : { enabled: false };
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

export function rocketLaunchWinners(launch) {
  return launch.winnersFinalizedAt || !launch.grabClosesAt ? launch.winners : [...launch.winners, ...(launch.grabWinners ?? [])];
}
export async function rocketRecipients(tx, winners, origin) {
  const users = await tx.user.findMany({ where: { id: { in: winners.map(w => w.userId) }, deletedAt: null, status: 'ACTIVE' }, select: { id: true, publicId: true, name: true, profileImage: true } });
  const recipients = [];
  for (const winner of winners) {
    const found = users.find(u => u.id === winner.userId);
    recipients.push({ rank: winner.rank, group: winner.group, user: found ? publicUser(found) : null, rewards: await displayRocketRewards(tx, winner.rewards, origin) });
  }
  return recipients;
}
// Caller holds the launch row lock. Closing and emitting are committed together.
export async function finalizeRocketGrab(tx, launch, now = new Date()) {
  if (launch.winnersFinalizedAt || !launch.grabClosesAt || launch.grabClosesAt > now) return launch;
  const inRoom = launch.grabWinners?.length ? launch.grabWinners : (launch.fallbackWinners ?? []);
  const updated = await tx.roomRocketLaunch.update({ where: { id: launch.id }, data: { winners: [...launch.winners, ...inRoom], winnersFinalizedAt: now } });
  const origin = process.env.MOBILE_API_BASE_URL || process.env.AUTH_URL || 'https://portal.megachat.live';
  const recipients = await rocketRecipients(tx, updated.winners, origin);
  await appendOutbox(tx, `audio-room:${launch.roomId}`, 'audio-room:rocket:winners', { roomId: launch.roomId, launchId: launch.id, cycle: launch.cycle, recipients });
  return updated;
}
export async function grabRocketLaunch(db, roomId, launchId, user, origin, clock = () => new Date()) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "RoomRocketLaunch" WHERE id=${launchId} FOR UPDATE`;
    const launch = await tx.roomRocketLaunch.findUnique({ where: { id: launchId } }), now = clock();
    if (!launch || launch.roomId !== roomId) throw rocketError('ROCKET_LAUNCH_NOT_FOUND', 'Rocket launch not found.', 404);
    if (!launch.grabClosesAt || launch.winnersFinalizedAt || launch.grabClosesAt <= now) throw rocketError('ROCKET_GRAB_CLOSED', 'The grab window has closed.', 409);
    if ((launch.grabbedUserIds ?? []).includes(user.id)) throw rocketError('ROCKET_GRAB_ALREADY', 'You have already grabbed this launch.', 409);
    const visible = await rocketVisibleMembers(tx, roomId, now, user.id);
    if (!visible.includes(user.id)) throw rocketError('ROCKET_GRAB_NOT_IN_ROOM', 'You must be present and visible in this room to grab.', 403);
    const grabWinners = [...(launch.grabWinners ?? [])], topWinner = launch.winners.some(w => w.userId === user.id);
    if (!topWinner && grabWinners.length < launch.inRoomWinners && launch.inRoomRewards?.length) {
      grabWinners.push({ userId: user.id, rank: null, group: 'inRoom', rewards: [launch.inRoomRewards[randomInt(launch.inRoomRewards.length)]] });
    }
    const updated = await tx.roomRocketLaunch.update({ where: { id: launchId }, data: { grabWinners, grabbedUserIds: [...(launch.grabbedUserIds ?? []), user.id] } });
    const winners = rocketLaunchWinners(updated), mine = winners.find(w => w.userId === user.id);
    return { launchId, cycle: launch.cycle, grabbed: true, grabClosesAt: launch.grabClosesAt.toISOString(), myRewards: await displayRocketRewards(tx, mine?.rewards ?? [], origin), recipients: await rocketRecipients(tx, winners, origin) };
  }, { isolationLevel: 'ReadCommitted', timeout: 15000 });
}

export async function payRocketLaunch(tx, id, now = new Date()) {
  await tx.$queryRaw`SELECT id FROM "RoomRocketLaunch" WHERE id=${id} FOR UPDATE`;
  let launch = await tx.roomRocketLaunch.findUniqueOrThrow({ where: { id } });
  if (launch.paidAt) return false;
  if (launch.grabClosesAt && !launch.winnersFinalizedAt) {
    if (launch.grabClosesAt > now) return false;
    launch = await finalizeRocketGrab(tx, launch, now);
  }
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
    if (winner.rewards.length) await notifyAction(tx, { userId: user.id, key: `rocket:${id}`, type: 'ROOM_ROCKET', title: 'Room Rocket reward', body: `You won ${winner.rewards.map(r => r.text).join(', ')} from Room Rocket`, action: { screen: 'ROOM_ROCKET_RESULTS', roomId: launch.roomId, campaignId: launch.campaignId, stageId: `LV-${launch.level}`, cycle:launch.cycle, launchId:launch.id } });
  }
  const paidUserIds = winner ? [...paid, winner.userId] : paid;
  await tx.roomRocketLaunch.update({ where: { id }, data: { paidUserIds, ...(paidUserIds.length >= launch.winners.length ? { paidAt: now } : {}) } });
  return true;
}

export async function maintainRoomRocketRewards(db = prisma) {
  // Finalize independently: a delayed wallet/asset payout must not hide winners.
  const closing = await db.roomRocketLaunch.findMany({ where: { winnersFinalizedAt: null, grabClosesAt: { lte: new Date() } }, orderBy: { grabClosesAt: 'asc' }, take: 50 });
  for (const launch of closing) {
    try {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "RoomRocketLaunch" WHERE id=${launch.id} FOR UPDATE`;
        await finalizeRocketGrab(tx, await tx.roomRocketLaunch.findUniqueOrThrow({ where: { id: launch.id } }));
      }, { timeout: 20000 });
    } catch (error) { console.error('Room Rocket winners deferred', { launchId: launch.id, code: error.code ?? error.name }); }
  }
  // Pending rewards belong to completed launches: disabling cannot erase earned rewards.
  const jobs = await db.roomRocketLaunch.findMany({ where: { paidAt: null, OR: [{ grabClosesAt: null }, { grabClosesAt: { lte: new Date() } }] }, orderBy: { createdAt: 'asc' }, take: 10 });
  for (const job of jobs) {
    try { await db.$transaction(tx => payRocketLaunch(tx, job.id), { isolationLevel: 'Serializable', timeout: 20000 }); }
    catch (error) { console.error('Room Rocket payout deferred', { launchId: job.id, code: error.code ?? error.name, message: error.message?.trim().split('\n').at(-1) }); }
  }
}

export async function maintainRoomRockets(db = prisma) {
  await drainRocketGifts(db);
  const season = await db.$transaction(tx => currentRocketSeason(tx));
  if (!season) return;
  const rollover = await db.$queryRaw`SELECT DISTINCT p."roomId" FROM "RoomRocketProgress" p
    WHERE p."campaignId" <> ${season.id} AND NOT EXISTS (
      SELECT 1 FROM "RoomRocketProgress" n WHERE n."roomId"=p."roomId" AND n."campaignId"=${season.id}
    ) LIMIT 50`;
  for (const row of rollover) await db.$transaction(tx => lockProgress(tx, row.roomId, season));
  const rooms = await db.roomRocketProgress.findMany({ where: { campaignId: season.id, AND: [{OR:[{dirty:true},{cooldownUntil:{lte:new Date()}},{resetAt:{lte:new Date()}}]},{OR:[{emittedAt:null},{emittedAt:{lte:new Date(Date.now()-500)}}]}] }, take: 50, orderBy: [{ emittedAt: { sort: 'asc', nulls: 'first' } }, { roomId: 'asc' }] });
  for (const row of rooms) await db.$transaction(async tx => {
    const snapshot = await rocketSnapshot(tx, row.roomId);
    if (!snapshot) return;
    const p = await tx.roomRocketProgress.findUnique({ where: { campaignId_roomId: { campaignId: season.id, roomId: row.roomId } } });
    if (!p.dirty || (p.emittedAt && p.emittedAt.getTime() > Date.now() - 500)) return;
    await appendOutbox(tx, `audio-room:${row.roomId}`, 'audio-room:rocket:progress', { roomId: row.roomId, campaignId: snapshot.campaign.id, ...snapshot.progress, topContributors: snapshot.topContributors, passengers: snapshot.passengers });
    await tx.roomRocketProgress.update({ where: { campaignId_roomId: { campaignId: season.id, roomId: row.roomId } }, data: { dirty: BigInt(snapshot.progress.queuedCoins)>0n && !snapshot.progress.cooldownUntil && !snapshot.progress.resetAt, emittedAt: new Date() } });
  });
}
