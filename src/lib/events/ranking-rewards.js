import { prisma } from '../prisma.js';
import { ledgerData } from '../wallet.js';
import { notifyAction } from '../action-notifications.js';
import { equippablePropCategories } from '../props-store.js';
import { uploadLibraryFilter } from '../upload-library-filter.js';
import { selectOwnedVip, vipRenewalExpiry } from '../vip-commerce.js';
import { rankingWindow } from './ranking-contract.js';
import { eventRankings } from './ranking-data.js';
import { rewardInput, policyFor } from './ranking-reward-rules.js';

export async function validateRewardAssets(tx, rewards) {
  for (const reward of rewards) {
    for (const prop of reward.props) {
      const asset = await tx.uploadAsset.findUnique({where:{id:prop.assetId},select:{active:true,category:true}});
      if (!asset?.active || !equippablePropCategories.has(asset.category)) throw new Error('A reward prop is inactive or not equippable.');
    }
    if (reward.vip && !(await tx.vipTier.findUnique({where:{id:reward.vip.tierId},select:{active:true}}))?.active) throw new Error('A reward VIP tier is inactive.');
  }
}

export async function saveRankingRewards(input, admin, db = prisma) {
  const data = rewardInput(input);
  return db.$transaction(async tx => {
    const event = await tx.event.findUnique({where:{slug:data.eventSlug}});
    if (!event) throw new Error('Create this ranking event first.');
    await validateRewardAssets(tx, data.rewards);
    // Restrict new configurations, without rewriting historical reward policies.
    for(const reward of data.rewards)for(const prop of reward.props){
      if(!await tx.uploadAsset.findFirst({where:{id:prop.assetId,...uploadLibraryFilter,active:true},select:{id:true}}))
        throw new Error('Choose an active reward prop, not level background artwork or an archived upload.');
    }
    const policy = await tx.rankingRewardPolicy.create({data:{...data,createdById:admin.id}});
    await tx.eventAuditLog.create({data:{userId:admin.id,eventId:event.id,action:'RANKING_REWARDS_CONFIGURED',metadata:{policyId:policy.id,...data,effectiveFrom:data.effectiveFrom.toISOString()}}});
    return policy;
  });
}

// Every recipient, wallet entry, inventory grant, VIP grant and notification commits
// with the round receipt. A crash or retry cannot pay a completed round twice.
export async function awardRankingRound(roundId, db = prisma) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "RankingRewardRound" WHERE id=${roundId} FOR UPDATE`;
    const round = await tx.rankingRewardRound.findUnique({where:{id:roundId}});
    if (!round || round.status !== 'PENDING') return;
    const policy = await tx.rankingRewardPolicy.findUnique({where:{id:round.policyId}});
    const event = await tx.event.findUnique({where:{slug:round.eventSlug}});
    if (event?.status !== 'PUBLISHED') throw new Error('Event is not published.');
    const validated = rewardInput({...policy,rewards:policy.rewards});
    if (!policy.enabled || round.startsAt < policy.effectiveFrom || round.endsAt > new Date()) throw new Error('Round is not eligible for awards.');
    await validateRewardAssets(tx, validated.rewards);
    const now = new Date();
    const ids = [...new Set(round.winners.flatMap(w => w.recipients))].sort();
    for (const id of ids) {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id} FOR UPDATE`;
      const user = await tx.user.findUnique({where:{id},select:{status:true,deletedAt:true}});
      const ban = await tx.ban.findFirst({where:{userId:id,target:'USER',revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]},select:{id:true}});
      if (!user || user.status !== 'ACTIVE' || user.deletedAt || ban) throw new Error('A winner is unavailable; review is required.');
    }
    for (const winner of round.winners) {
      const reward = validated.rewards.find(r => r.rank === winner.rank);
      if (!reward) continue;
      for (const userId of winner.recipients) {
        const key = `ranking:${round.id}:${winner.rank}:${userId}`;
        const coins = BigInt(reward.coins), diamonds = BigInt(reward.diamonds);
        if (coins || diamonds) {
          await tx.user.update({where:{id:userId},data:{coinBalance:{increment:coins},hostSalaryCoinBalance:{increment:diamonds}}});
          await tx.walletTransaction.create({data:ledgerData({userId,type:'BONUS',direction:'CREDIT',title:'Ranking event reward',coins,diamonds,referenceId:key,metadata:{roundId:round.id,rank:winner.rank,eventSlug:round.eventSlug,period:round.period}})});
        }
        for (const prop of reward.props) {
          const where = {assetId_userId:{assetId:prop.assetId,userId}};
          const old = await tx.uploadAssetAssignment.findUnique({where});
          // Conditional entitlements cannot be safely merged into this single-row
          // inventory without losing their revocation semantics. Hold for review.
          if (old && ['VIP','VIP_TIER','RESELLER','BD','ADMIN','JUNIOR_ADMIN','SENIOR_ADMIN','SUPER_ADMIN','COUNTRY_HEAD'].includes(old.source)) throw new Error('Reward prop overlaps a conditional role/VIP entitlement; review required.');
          // Permanent ownership is never shortened. Existing source semantics are retained.
          if (old && !old.expiresAt) continue;
          const expiresAt = new Date(Math.max(now.getTime(),old?.expiresAt?.getTime() ?? 0)+prop.days*86400000);
          await tx.uploadAssetAssignment.upsert({where,create:{assetId:prop.assetId,userId,expiresAt,source:'RANKING_REWARD',sourceReference:key},update:{expiresAt}});
        }
        if (reward.vip) {
          const {tierId,days} = reward.vip;
          const tier = await tx.vipTier.findUnique({where:{id:tierId},include:{assets:true}});
          const old = await tx.vipOwnership.findUnique({where:{userId_tierId:{userId,tierId}}});
          const data = {startsAt:old && !old.revokedAt && old.expiresAt>now?old.startsAt:now,expiresAt:vipRenewalExpiry(old,days,now),revokedAt:null};
          const owned = await tx.vipOwnership.upsert({where:{userId_tierId:{userId,tierId}},create:{userId,tierId,...data},update:data});
          const selected = await tx.vipMembership.findUnique({where:{userId},include:{tier:true}});
          if (!selected || selected.revokedAt || selected.expiresAt<=now || !selected.tier.active || selected.tierId===tierId) await selectOwnedVip(tx,userId,owned,tier);
        }
        await notifyAction(tx,{userId,key,type:'RANKING_REWARD',title:'Ranking reward received',body:`You earned rank ${winner.rank} in ${policy.track} (${round.period}). Your rewards have been added.`,action:{eventSlug:round.eventSlug,roundId:round.id,rank:winner.rank}});
      }
    }
    await tx.rankingRewardRound.update({where:{id:round.id},data:{status:'AWARDED',awardedAt:now,error:null}});
    await tx.eventAuditLog.create({data:{eventId:event.id,action:'RANKING_REWARDS_AWARDED',metadata:{roundId:round.id,winners:round.winners,rewards:policy.rewards}}});
  },{isolationLevel:'Serializable',timeout:30000});
}

let running = false;
export async function maintainRankingRewards(db = prisma) {
  if (running) return;
  running = true;
  try {
    const policies = await db.rankingRewardPolicy.findMany({orderBy:[{effectiveFrom:'asc'},{createdAt:'asc'}]});
    const groups = Map.groupBy(policies,p => `${p.eventSlug}:${p.period}`);
    for (const group of groups.values()) {
      const first = group[0], now = new Date();
      // Resume from persisted rounds, never from any period before initial activation.
      const last = await db.rankingRewardRound.findFirst({where:{eventSlug:first.eventSlug,period:first.period},orderBy:{startsAt:'desc'}});
      let start = last?.endsAt ?? first.effectiveFrom;
      for (let n=0;n<10;n++) {
        const window = rankingWindow(first.period,start);
        if (window.end > now) break;
        const policy = policyFor(group,start);
        const event = await db.event.findUnique({where:{slug:first.eventSlug},select:{status:true}});
        const eligible = policy?.enabled && event?.status === 'PUBLISHED';
        const rows = eligible ? await eventRankings({type:first.track,period:first.period,window,raw:true},db) : [];
        const winners = rows.filter(w => policy.rewards.some(r => r.rank===w.rank));
        // Membership/ownership is mutable; after extended downtime do not silently
        // pay a reconstructed ranking as if it had been captured at the deadline.
        const delayed = eligible && now.getTime()-window.end.getTime()>10*60000;
        await db.rankingRewardRound.upsert({where:{eventSlug_period_startsAt:{eventSlug:first.eventSlug,period:first.period,startsAt:start}},update:{},create:{eventSlug:first.eventSlug,period:first.period,startsAt:start,endsAt:window.end,policyId:policy.id,winners,status:!eligible?'SKIPPED':delayed?'REVIEW':'PENDING',error:delayed?'Snapshot captured more than 10 minutes after close. Verify recipients and scores before authorizing retry.':null}});
        start = window.end;
      }
    }
    const pending = await db.rankingRewardRound.findMany({where:{status:'PENDING'},orderBy:{endsAt:'asc'},take:10});
    for (const round of pending) {
      try { await awardRankingRound(round.id,db); }
      catch (error) {
        // Serialization conflicts retry on the next tick; invalid winners/config need review.
        if (['P2034','P2002'].includes(error.code)) continue;
        await db.rankingRewardRound.updateMany({where:{id:round.id,status:'PENDING'},data:{status:'REVIEW',error:String(error.message).slice(0,500)}});
      }
    }
  } finally { running = false; }
}
