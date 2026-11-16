import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { deletionOwnedModels, assertDeletionInventory, deletedUserData, redactDeletedIdentity } from './account-deletion-policy.js';
import { privateChatObject } from './chat-media.js';
import { voiceObject } from './voice-storage.js';
import { deletionObjectKey, deletePublicDeletionObject } from './account-deletion-cdn.js';
import { recordDeletionJournal } from './account-deletion-journal.js';
import { bannerObject } from './room-banner-media.js';
const fail = (code, message, status = 409) => Object.assign(new Error(message), { code, status });
// Keep this new destructive workflow disabled in production until the media,
// backup and residual-data audit is complete. Existing live flows are unchanged.
function assertDeletionEnabled() {
  if (process.env.NODE_ENV === 'production' && process.env.ACCOUNT_DELETION_ENABLED !== 'true')
    throw fail('DELETION_NOT_ENABLED', 'The account-deletion workflow is not enabled yet.', 503);
}
const quote = s => '"' + s.replaceAll('"', '""') + '"';


// Called only after mobile authentication or an administrator verifies a request.
// Queueing and session revocation commit together. No public-ID-only deletion API.
export async function requestAccountDeletion(db, userId, { source, verifiedBy = null }) {
  assertDeletionEnabled();
  if (!['AUTHENTICATED_USER', 'VERIFIED_SUPPORT', 'ADMIN_ACTION'].includes(source) || (source !== 'AUTHENTICATED_USER' && !verifiedBy)) throw fail('UNVERIFIED_REQUEST', 'Verify account ownership first.', 403);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const existing = await tx.accountDeletionRequest.findUnique({ where: { userId } });
    if (existing) return existing;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw fail('ACCOUNT_UNAVAILABLE', 'Account is unavailable.', 404);
    const job = await tx.accountDeletionRequest.create({ data: { userId, source, verifiedBy } });
    await tx.user.update({ where: { id: userId }, data: { status: 'BANNED', deletedAt: new Date(), forcedLogoutAt: new Date(), sessionVersion: { increment: 1 } } });
    return job;
  }, { timeout: 5000, maxWait: 1000 });
}

async function queueObject(tx, requestId, kind, key) {
  if (!key) return;
  await tx.accountDeletionObject.upsert({ where: { requestId_kind_key: { requestId, kind, key } }, create: { requestId, kind, key }, update: {} });
}

// This function deliberately has no network IO. Storage failures are retried
// separately and a request cannot become COMPLETED while any object remains.
export async function purgeAccountData(db, requestId) {
  assertDeletionEnabled();

  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '750ms'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '4000ms'");
    await tx.$queryRaw`SELECT id FROM "AccountDeletionRequest" WHERE id=${requestId} FOR UPDATE`;
    const job = await tx.accountDeletionRequest.findUnique({ where: { id: requestId } });
    if (!job || !['QUEUED', 'RETRY'].includes(job.status)) return;
    // Prisma 7 runtime DMMF omits relationFromFields. Read the actual database
    // constraints so a missing/generated relation cannot silently skip deletion.
    const relations = await tx.$queryRawUnsafe(`SELECT t.relname AS name, a.attname AS field
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ANY(c.conkey)
      WHERE c.contype='f' AND c.confrelid='"User"'::regclass AND n.nspname=current_schema()`);
    const ownership = Object.values(relations.reduce((all,r) => {
      (all[r.name] ||= {name:r.name,fields:[]}).fields.push(r.field); return all;
    }, {}));
    assertDeletionInventory(ownership.map(m => ({name:m.name, fields:[{kind:'object',type:'User',relationFromFields:m.fields}]})));
    if (!ownership.some(m => m.name === 'Post' && m.fields.includes('authorId'))) throw fail('INVENTORY_UNAVAILABLE','Cannot verify account ownership constraints.');
    const userId = job.userId;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.deletedAt || user.status !== 'BANNED') throw fail('ACCOUNT_NOT_REVOKED', 'Account must be revoked before cleanup.');
    // Do not cancel or corrupt outstanding payments or live game settlements.
    const pending = await Promise.all([
      tx.currencyRequest.count({ where: { userId, status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] } } }),
      tx.walletWithdrawal.count({ where: { userId, status: { in: ['PENDING', 'APPROVED'] } } }),
      tx.resellerPayout.count({ where: { OR: [{ senderId: userId }, { resellerId: userId }], status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] } } }),
      tx.sharedGameEntry.count({ where: { userId, status: { in: ['PENDING', 'OPEN'] } } }),
    ]);
    const pendingTopUps = await tx.walletTopUpOrder.count({where:{userId,status:'PENDING',expiresAt:{gt:new Date()}}});
    const pendingEnvelopes = await tx.redEnvelope.count({where:{senderId:userId,status:'ACTIVE'}});
    const pendingLaunch = await tx.$queryRaw`SELECT 1 FROM "RoomRocketLaunch" WHERE "paidAt" IS NULL AND (winners::text LIKE ${'%'+userId+'%'} OR "topContributor"::text LIKE ${'%'+userId+'%'} OR "grabWinners"::text LIKE ${'%'+userId+'%'}) LIMIT 1`;
    const pendingRocket = await tx.$queryRaw`SELECT 1 FROM "RoomRocketPendingGift" p JOIN "GiftTransaction" g ON g.id=p."giftId" WHERE g."senderId"=${userId} OR g."recipientUserId"=${userId} LIMIT 1`;
    const pendingRoomRewards = await tx.roomRewardPayout.count({where:{ownerId:{in:[userId,user.publicId]},status:{in:['PENDING','PROCESSING']}}});
    if (pendingTopUps || pendingEnvelopes || pendingLaunch.length || pendingRocket.length || pendingRoomRewards || pending.some(Boolean)) throw fail('PENDING_SETTLEMENT', 'Support must finish outstanding settlements before deletion.');
    const anonymous = job.scope?.restoreAnonymous || `DELETED-${randomUUID()}`;
    const identities = new Set([userId, user.publicId]);
    const specials = await tx.specialIdAssignment.findMany({ where: { userId }, select: { specialId: true } });
    specials.forEach(x => identities.add(x.specialId));
    const talent = await tx.talent.findUnique({ where: { publicId: user.publicId } });
    const kyc = await tx.talentVerification.findMany({ where: { OR: [{ userId }, ...(talent ? [{ talentId: talent.id }] : [])] } });
    for (const row of kyc) for (const value of [row.identityCardFront, row.identityCardBack, row.profileImage]) {
      if (value?.startsWith('kyc:')) await tx.kycImage.deleteMany({ where: { id: value.slice(4) } });
    }
    if (talent) {
      if (await tx.salaryHistory.count({where:{talentId:talent.id,status:{in:['PENDING','APPROVED','PROCESSING']}}})) throw fail('PENDING_SETTLEMENT','Finish pending host salary before deletion.');
      await tx.salaryHistory.updateMany({where:{talentId:talent.id},data:{notes:null}});
      await tx.talentPerformance.deleteMany({where:{talentId:talent.id}});
      await tx.talentViolation.deleteMany({where:{talentId:talent.id}});
      await tx.liveSession.deleteMany({where:{talentId:talent.id}});
      await tx.ban.deleteMany({where:{talentId:talent.id}});
      await tx.talentVerification.deleteMany({ where: { talentId: talent.id } });
      await tx.device.deleteMany({ where: { talentId: talent.id } });
      await tx.talent.update({ where: { id: talent.id }, data: { publicId: anonymous, displayName: 'Deleted User', legalName: '', email: `${randomUUID()}@deleted.invalid`, phone: null, country: null, profileImage: null, identityCardImage: null, status: 'BANNED', coinBalance:0n, hostSalaryCoinBalance:0n, totalGiftsValue:0n, followers:0, liveMinutes:0 } });
    }
    const messages = await tx.message.findMany({ where: { senderId: userId }, select: { voiceKey: true } });
    for (const row of messages) await queueObject(tx, requestId, 'VOICE', row.voiceKey);
    const media = await tx.chatMediaObject.findMany({ where: { uploaderId: userId } });
    for (const row of media) {
      await queueObject(tx, requestId, 'CHAT', row.key);
      await queueObject(tx, requestId, 'CHAT', row.posterKey);
    }
    await tx.chatMediaObject.deleteMany({ where: { uploaderId: userId } });
    const banners = await tx.roomBanner.findMany({ where: { ownerId: userId } });
    for (const row of banners) {
      await queueObject(tx, requestId, 'BANNER', row.storageKey);
      await queueObject(tx, requestId, 'BANNER', row.publicKey);
    }
    // Only private user-created assets, never purchased catalogue props/artwork.
    const privateAssets = await tx.uploadAsset.findMany({ where: { isGlobal: false, storeVisible: false, category: 'AVATARS', assignments: { some: { userId }, every: { userId } } }, select: { id: true, cdnUrl: true, posterCdnUrl: true } });
    for (const asset of privateAssets) for (const url of [asset.cdnUrl, asset.posterCdnUrl]) {
      if (url) await queueObject(tx, requestId, 'PUBLIC', deletionObjectKey(url, process.env.MEDIA_CDN_BASE_URL || 'https://media.megachat.live'));
    }
    const backgrounds = await tx.customRoomBackgroundRequest.findMany({ where: { userId, approvedAssetId: { not: null } }, select: { approvedAssetId: true } });
    const customAssets = await tx.uploadAsset.findMany({where:{id:{in:backgrounds.map(x=>x.approvedAssetId)}}});
    for (const asset of customAssets) {
      if (asset.isGlobal || asset.storeVisible || await tx.uploadAssetAssignment.count({where:{assetId:asset.id,userId:{not:userId}}})) throw fail('SHARED_CUSTOM_MEDIA_REVIEW','A shared custom asset needs ownership review.');
      for (const url of [asset.cdnUrl,asset.posterCdnUrl]) if(url)await queueObject(tx,requestId,'PUBLIC',deletionObjectKey(url,process.env.MEDIA_CDN_BASE_URL||'https://media.megachat.live'));
    }
    const rooms = await tx.audioRoom.findMany({where:{ownerId:userId},select:{id:true}});
    const roomIds=rooms.map(r=>r.id);
    const music = await tx.uploadAsset.findMany({where:{audioRoomId:{in:roomIds},category:'MUSIC_TRACKS',isGlobal:false,storeVisible:false},select:{id:true,cdnUrl:true,posterCdnUrl:true}});
    for(const asset of music)for(const url of [asset.cdnUrl,asset.posterCdnUrl])if(url)await queueObject(tx,requestId,'PUBLIC',deletionObjectKey(url));
    const personalAssetIds=[...privateAssets,...customAssets,...music].map(a=>a.id);
    // CP child tables intentionally use Restrict: explicitly erase their history first.
    const relationships=await tx.profileRelationship.findMany({where:{OR:[{leftUserId:userId},{rightUserId:userId}]},select:{id:true}});
    const relationshipIds=relationships.map(r=>r.id);
    await tx.cpGiftExperience.deleteMany({where:{relationshipId:{in:relationshipIds}}});
    await tx.cpLevelClaim.deleteMany({where:{relationshipId:{in:relationshipIds}}});
    await tx.uploadAssetAssignment.updateMany({where:{giftedByUserId:{in:[...identities]}},data:{giftedByUserId:null}});
    await tx.audioRoomSeatRequest.updateMany({where:{actorPublicId:{in:[...identities]}},data:{actorPublicId:null}});
    await tx.ban.updateMany({where:{actorUserId:userId},data:{actorUserId:null}});
    for(const table of ['RoomRocketGift','RoomRocketCredit'])await tx.$executeRawUnsafe(`UPDATE ${quote(table)} SET "senderId"=$1 WHERE "senderId"=ANY($2::text[])`,anonymous,[...identities]);
    await tx.roomRewardPayout.updateMany({where:{ownerId:{in:[...identities]}},data:{ownerId:anonymous,error:null}});

    await tx.agencyApplication.updateMany({ where: { bdUserId: userId }, data: { bdUserId: null } });
    await tx.agencyApplication.updateMany({ where: { reviewedByUserId: userId }, data: { reviewedByUserId: null } });
    await tx.audioRoomRole.updateMany({ where: { grantedById: userId }, data: { grantedById: null } });
    await tx.user.updateMany({ where: { supervisorUserId: userId }, data: { supervisorUserId: null, teamRole: null, teamGrantedRole: null } });
    await tx.agency.updateMany({ where: { ownerUserId: userId }, data: { ownerUserId: null } });
    await tx.agency.updateMany({ where: { bdUserId: userId }, data: { bdUserId: null } });
    await tx.conversation.updateMany({ where: { createdById: userId }, data: { createdById: null } });
    await tx.conversation.updateMany({ where: { kind: 'DIRECT', participants: { some: { userId } } }, data: { directKey: null } });
    await tx.audioRoomSeat.updateMany({ where: { occupantUserId: userId }, data: { occupantUserId: null, occupiedAt: null, isSpeaking: false, isMuted: true, note: null } });
    await tx.audioRoom.updateMany({ where: { ownerId: userId }, data: { title: 'Closed room', status: 'ENDED', endedAt: new Date(), joiningDisabled: true, announcement: null, country: null, language: null, tags: [], liveAudioUrl: null, recordingUrl: null, coverImageUrl: null, coverImageData: null, coverImageMime: null, passwordHash: null, seatLayout: Prisma.DbNull, giftInteractions: Prisma.DbNull } });
    await tx.videoLiveSession.updateMany({ where: { hostId: userId }, data: { title: 'Ended live', coverUrl: null, announcement: null, status: 'ENDED' } });
    // Retain amounts and settlement references, not payment identity or profiles.
    await tx.walletTransaction.updateMany({ where: { userId }, data: { title: 'Deleted account transaction', description: null, metadata: Prisma.DbNull } });
    await tx.walletWithdrawal.updateMany({ where: { userId }, data: { accountName: '', accountNumber: '', reviewNote: null, rejectionReason: null } });
    await tx.currencyRequest.updateMany({ where: { userId }, data: { destination: null, reviewNote: null, policySnapshot: {} } });
    await tx.currencyRequest.updateMany({ where: { recipientPublicId: { in: [...identities] } }, data: { recipientPublicId: anonymous } });
    await tx.resellerPayout.updateMany({ where: { senderId: userId }, data: { bankCipher: '', maskedBank: '', quote: {}, country: '', proofData: null, proofMimeType: null, reviewReason: null } });
    await tx.coinAdjustment.updateMany({ where: { userId }, data: { reason: 'Deleted account adjustment' } });
    await tx.vipPurchase.updateMany({ where: { userId }, data: { result: {} } });
    await tx.propPurchase.updateMany({ where: { userId }, data: { result: Prisma.DbNull } });
    await tx.roomBanner.updateMany({ where: { ownerId: userId }, data: { name: '', description: '', status: 'EXPIRED', imageUrl: null, publicKey: null, reason: null } });

    // Delete dependent rows in FK order; savepoints prevent an expected FK-order
    // conflict from aborting the transaction. Unknown dependencies fail closed.
    let remaining = ownership.filter(m => deletionOwnedModels.has(m.name)).map(m => ['AgencyApplication','AudioRoomRole','AudioRoomBan','VideoLiveBan'].includes(m.name) ? {...m,fields:['userId']} : m);
    for (let pass = 0; remaining.length && pass < 8; pass++) {
      const retry = [];
      for (const model of remaining) {
        await tx.$executeRawUnsafe('SAVEPOINT account_delete_row');
        try {
          await tx.$executeRawUnsafe(`DELETE FROM ${quote(model.name)} WHERE ${model.fields.map(f => `${quote(f)}=$1`).join(' OR ')}`, userId);
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT account_delete_row');
        } catch (error) {
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT account_delete_row');
          await tx.$executeRawUnsafe('RELEASE SAVEPOINT account_delete_row');
          if (error.meta?.code !== '23503') throw error;
          retry.push(model);
        }
      }
      remaining = retry;
    }
    if (remaining.length) throw fail('DEPENDENCY_REVIEW', 'An associated record requires review.');
    await tx.uploadAsset.deleteMany({ where: { id: { in: personalAssetIds } } });
    // Known ownership records without declared User foreign keys.
    const loose = { TaskTimerCursor: ['userId'], GroupChangeRequest: ['actorId'], ResellerRechargeRequest: ['actorId'], PropGift: ['senderUserId','recipientUserId'], SpecialIdPurchase: ['userId'], ActivityLevelAward: ['subjectId'], RoomRecipientGiftTotal: ['userId'], RoomGiftDiamondCredit: ['userId'], RoomRocketContribution: ['userId'], HostSalaryAward: ['userId'], VideoLiveInvite: ['userId'], VideoLiveAlertCooldown: ['hostId'], AudioRoomPkSearch: ['ownerId'], ConfirmedRealtimeEvent: ['userId'] };
    for (const [table, fields] of Object.entries(loose)) await tx.$executeRawUnsafe(`DELETE FROM ${quote(table)} WHERE ${fields.map(f => `${quote(f)}=ANY($1::text[])`).join(' OR ')}`, [...identities]);
    await tx.apiRequestLog.deleteMany({ where: { userPublicId: { in: [...identities] } } });
    await tx.legacyIdMapping.deleteMany({ where: { userId } });
    await tx.globalAnnouncement.deleteMany({ where: { actorId: { in: [...identities] } } });
    await tx.safetyReport.deleteMany({ where: { OR: [{ reporterUserId: userId }, { targetInternalId: userId }, { targetId: { in: [...identities] } }] } });
    // Persist the marker last. Remaining ledger FKs point at an identity-free,
    // unsearchable tombstone and other users' balances are never recalculated.
    await tx.user.update({ where: { id: userId }, data: deletedUserData(anonymous) });
    await tx.accountDeletionRequest.update({ where: { id: requestId }, data: { status: 'SNAPSHOTS_PENDING', lastError: null, scope: { identities: [...identities], anonymous } } });
    return { identities: [...identities], anonymous };
  }, { timeout: 20000, maxWait: 1000 });
}

export async function cleanDeletionObjects(db, requestId) {
  const rows = await db.accountDeletionObject.findMany({ where: { requestId, completedAt: null }, take: 2 });
  for (const row of rows) {
    if (row.kind === 'CHAT') await privateChatObject('delete', row.key);
    else if (row.kind === 'VOICE') await voiceObject('delete', row.key);
    else if (row.kind === 'BANNER') {
      if (row.key.startsWith('room-banners/')) await deletePublicDeletionObject(row.key);
      else await bannerObject('delete', row.key);
    }
    else if (row.kind === 'PUBLIC') await deletePublicDeletionObject(row.key);
    else throw fail('UNKNOWN_MEDIA_KIND', 'Unsupported cleanup object.');
    await db.accountDeletionObject.update({ where: { id: row.id }, data: { completedAt: new Date() } });
  }
  // Completion is deliberately not automatic until residual snapshots and
  // backups have been reviewed. Never certify a partial purge as completed.
}

export async function scrubDeletionSnapshots(db, requestId) {
  const job = await db.accountDeletionRequest.findUnique({ where: { id: requestId } });
  if (job?.status !== 'SNAPSHOTS_PENDING') return;
  const ids = new Set(job.scope.identities), replacement = job.scope.anonymous;
  // Bounded, row-scoped updates. Never lock whole tables or scan binary assets.
  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.name.startsWith('AccountDeletion')) continue;
    for (const field of model.fields.filter(f => f.kind === 'scalar' && f.type === 'Json')) {
      const patterns = [...ids].map(id => `%"${id.replaceAll('%', '\\%').replaceAll('_', '\\_')}"%`);
      const rows = await db.$queryRawUnsafe(`SELECT ctid::text AS locator, xmin::text AS version, ${quote(field.name)} AS value FROM ${quote(model.name)} WHERE ${quote(field.name)}::text LIKE ANY($1::text[]) LIMIT 501`, patterns);
      if (rows.length > 500) throw fail('SNAPSHOT_REVIEW', 'Large snapshot backlog requires a scoped cleanup.');
      for (const row of rows) {
        const redacted = redactDeletedIdentity(row.value, ids, replacement);
        if (JSON.stringify(row.value) === JSON.stringify(redacted)) continue;
        const count = await db.$executeRawUnsafe(`UPDATE ${quote(model.name)} SET ${quote(field.name)}=$1::jsonb WHERE ctid::text=$2 AND xmin::text=$3`, JSON.stringify(redacted), row.locator, row.version);
        if (count !== 1) throw fail('SNAPSHOT_CHANGED', 'Snapshot changed; cleanup will retry.');
      }
    }
  }
  await db.auditLog.updateMany({ where: { entityId: { in: [...ids] } }, data: { entityId: replacement, description: 'Deleted account activity', metadata: Prisma.DbNull, ipAddress: null } });
  await db.accountDeletionRequest.update({ where: { id: requestId }, data: { status: 'MEDIA_PENDING' } });
}

export async function runAccountDeletion(db, requestId) {
  assertDeletionEnabled();
  const initial=await db.accountDeletionRequest.findUnique({where:{id:requestId}});
  // Allow already authenticated HTTP requests and disconnect callbacks to drain.
  if(process.env.NODE_ENV==='production' && initial && ['QUEUED','RETRY'].includes(initial.status) && Date.now()-initial.createdAt.getTime()<360000) return;
  try {
    await purgeAccountData(db, requestId);
    await scrubDeletionSnapshots(db, requestId);
    const job = await db.accountDeletionRequest.findUnique({ where: { id: requestId } });
    if (job?.status === 'MEDIA_PENDING') {
      await cleanDeletionObjects(db, requestId);
      if (!await db.accountDeletionObject.count({ where: { requestId, completedAt: null } })) {
        await db.accountDeletionRequest.update({ where: { id: requestId }, data: { status: 'REVIEW_REQUIRED', lastError: 'BACKUP_AND_EXTERNAL_COPY_REVIEW' } });
      }
    }
  } catch (error) {
    await db.accountDeletionRequest.update({ where: { id: requestId }, data: { attempts: { increment: 1 }, lastError: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'CLEANUP_RETRY_REQUIRED' } });
    throw error;
  }
}

// Completion is an explicit support attestation, never an automatic assertion
// that unknown third-party copies were erased. The marker is written first.
export async function completeAccountDeletion(db, requestId, {verifiedBy, externalCopiesReviewed, backupPolicyVerified}, journalPath) {
  assertDeletionEnabled();
  if(!verifiedBy || externalCopiesReviewed!==true || backupPolicyVerified!==true)throw fail('REVIEW_REQUIRED','Verify external copies and backup retention before completing.');
  const job=await db.accountDeletionRequest.findUnique({where:{id:requestId}});
  if(job?.status==='COMPLETED')return job;
  if(job?.status!=='REVIEW_REQUIRED'||!job.scope?.anonymous)throw fail('CLEANUP_INCOMPLETE','Finish cleanup before completing.');
  if(await db.accountDeletionObject.count({where:{requestId,completedAt:null}}))throw fail('MEDIA_PENDING','Media cleanup is incomplete.');
  const user=await db.user.findUnique({where:{id:job.userId}});
  if(!user?.deletedAt||user.publicId!==job.scope.anonymous||user.email||user.phone||user.googleSubject||user.profileImage||user.passwordHash)throw fail('IDENTITY_REVIEW','Personal identity cleanup requires review.');
  recordDeletionJournal(job,journalPath);
  return db.accountDeletionRequest.update({where:{id:requestId},data:{status:'COMPLETED',completedAt:new Date(),lastError:null,verifiedBy,scope:Prisma.DbNull}});
}

export function startAccountDeletionWorker(db) {
  let busy=false;
  const tick=async()=>{
    if(busy||process.env.ACCOUNT_DELETION_ENABLED!=='true')return;
    busy=true;
    try {
      const job=await db.accountDeletionRequest.findFirst({where:{status:{in:['QUEUED','RETRY','SNAPSHOTS_PENDING','MEDIA_PENDING']},createdAt:{lte:new Date(Date.now()-360000)},attempts:{lt:10}},orderBy:{updatedAt:'asc'}});
      if(job)await runAccountDeletion(db,job.id);
    }catch(error){console.error('Account deletion deferred',error.code||'CLEANUP_RETRY_REQUIRED');}finally{busy=false;}
  };
  const timer=setInterval(tick,30000);timer.unref();return()=>clearInterval(timer);
}
