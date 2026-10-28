import { currencyPolicy } from '@/lib/currency-policy';
import { calculateGiftSettlement, assertGiftRecipient, fixedGiftDiamonds } from '@/lib/gift-currency-settlement';
import { giftOperation, priorGiftOperation, runGiftOperation, flushRealtimeOutbox } from '@/lib/gift-operation';
import { awardGiftProgress, appendOutbox, publicProgression } from '@/lib/progression';
import { parseGiftBatchId } from '@/lib/gift-batch';
import { prisma } from '@/lib/prisma';
import { mobileApiError, giftJson, mobileOptions, requireMobileUser } from '@/lib/mobile-api';
import { audioRoomParticipantIds } from '@/lib/realtime';
import { getProfitSplitRule } from '@/lib/profit-rules';
import { ledgerData } from '@/lib/wallet';
import { giftMedia } from '@/lib/gift-media';
import { requestOrigin } from '@/lib/user-perks';
import { resolveGiftSender } from '@/lib/gift-sender';
import { luckyPolicy, settleLuckyRewards, multiplierLabel } from '@/lib/lucky-gifts';

export function OPTIONS() { return mobileOptions(); }
const invalid = message => Object.assign(new Error(message), { code: 'VALIDATION_ERROR' });
export async function POST(request) {
  try {
    const sender = await requireMobileUser(request), body = await request.json();
    const roomId = body?.roomId, bagItemId = body?.bagItemId, backpack = bagItemId != null;
    // Inventory uses (userId, giftAssetId); its public bag ID is the gift public ID.
    const giftId = body?.giftId ?? bagItemId, quantity = body?.quantity ?? 1;
    const ids = Array.isArray(body?.recipientIds) ? [...new Set(body.recipientIds)] : [];
    const key = request.headers.get('Idempotency-Key') || body?.requestId;
    if (typeof roomId !== 'string' || !roomId || roomId.length > 120 || typeof giftId !== 'string' || !giftId || giftId.length > 128 ||
      !ids.length || ids.length > 26 || ids.some(id => typeof id !== 'string' || !id || id.length > 128) ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 999 || typeof key !== 'string' || !key ||
      (backpack && (typeof bagItemId !== 'string' || bagItemId !== giftId)) || body?.liveId || body?.conversationId)
      throw invalid('Provide a room, gift or matching bagItemId, 1–26 recipients, quantity 1–999 and an Idempotency-Key.');
    const operation = giftOperation(body, key, 'MULTI');
    const replay = await priorGiftOperation(sender.id, operation);
    if (replay) return giftJson({ success: true, data: replay }, 201);
    const giftBatchId = parseGiftBatchId(body.giftBatchId), comboId = parseGiftBatchId(body.comboId), origin = requestOrigin(request);
    const [room, gift, rows, policy, participants] = await Promise.all([
      prisma.audioRoom.findFirst({ where: { roomId, status: 'LIVE' } }),
      prisma.uploadAsset.findFirst({ where: { publicId: giftId, category: 'GIFTS', active: true, giftTier: { in: ['CLASSIC', 'PREMIUM', 'VIP', 'LUCKY'] }, coinPrice: { gt: 0n } } }),
      prisma.user.findMany({ where: { publicId: { in: ids }, deletedAt: null, status: 'ACTIVE' }, select: { id: true, publicId: true, name: true, appRoles: true, agencyId: true } }),
      getProfitSplitRule(), audioRoomParticipantIds(roomId),
    ]);
    if (!room) throw Object.assign(new Error('Room unavailable.'), { code: 'ROOM_NOT_LIVE' });
    if (!gift) throw Object.assign(new Error('Gift unavailable.'), { code: 'GIFT_NOT_FOUND' });
    if (rows.length !== ids.length || !participants.has(sender.publicId) || ids.some(id => !participants.has(id)))
      throw Object.assign(new Error('Every sender and recipient must be in the room.'), { code: 'ROOM_PARTICIPANT_REQUIRED' });
    const byId = new Map(rows.map(row => [row.publicId, row])), recipients = ids.map(id => byId.get(id));
    const each = gift.coinPrice * BigInt(quantity), total = each * BigInt(ids.length), itemCount = quantity * ids.length;
    const senderArtwork = await resolveGiftSender(sender, origin);
    const response = await runGiftOperation(sender.id, operation, async tx => {
      for (const recipient of recipients) await assertGiftRecipient(tx, recipient);
      if (backpack) {
        const used = await tx.userGiftInventory.updateMany({ where: { userId: sender.id, giftAssetId: gift.id, quantity: { gte: itemCount } }, data: { quantity: { decrement: itemCount } } });
        if (!used.count) throw new Error('BACKPACK_INSUFFICIENT');
      } else {
        const debit = await tx.user.updateMany({ where: { id: sender.id, coinBalance: { gte: total } }, data: { coinBalance: { decrement: total }, totalSpent: { increment: total } } });
        if (!debit.count) throw new Error('INSUFFICIENT_COINS');
      }
      const currency = await currencyPolicy(tx);
      // Match single backpack sends: inventory gifts do not create Lucky returns.
      const lucky = !backpack && gift.giftTier === 'LUCKY' ? await luckyPolicy(tx) : null;
      const results = [], prepared = []; let progression = null, totalLucky = 0n;
      for (const recipient of recipients) {
        const host = recipient.appRoles.includes('HOST');
        const split = calculateGiftSettlement(each, host, policy, currency, 0n, { fixedDiamonds: fixedGiftDiamonds(gift.hostDiamonds, quantity), luckyPoolBps: lucky?.poolContributionBps ?? null });
        const giftTx = await tx.giftTransaction.create({ data: { giftBatchId, senderId: sender.id, recipientUserId: recipient.id, giftAssetId: gift.id, giftName: gift.name, quantity, coinValue: each, roomId } });
        await tx.giftSettlement.create({ data: {
          giftTransactionId: giftTx.id, recipientDiamonds: split.receivedDiamonds, currencyPolicyVersion: currency.version,
          agencyId: recipient.agencyId, recipientType: host ? 'HOST' : 'NORMAL_USER', grossCoins: each,
          hostSalaryCoins: split.hostSalaryCoins, agencyCoins: split.agencyCoins, companyCoins: split.companyCoins,
          reusableCoins: split.reusableCoins, luckyPoolCoins: split.luckyPoolCoins,
          hostShareBps: host ? policy.hostShareBps : 0, agencyShareBps: host ? policy.agencyShareBps : 0,
          companyShareBps: host ? policy.companyShareBps : 10000 - policy.normalUserReusableShareBps,
          reusableShareBps: policy.normalUserReusableShareBps, policyVersion: policy.version,
        } });
        await tx.user.update({ where: { id: recipient.id }, data: { hostSalaryCoinBalance: { increment: split.receivedDiamonds } } });
        if (split.receivedDiamonds > 0n) await tx.walletTransaction.create({ data: ledgerData({ userId: recipient.id, type: 'GIFT_RECEIVED', direction: 'CREDIT', title: 'Received gift', diamonds: split.receivedDiamonds, referenceId: giftTx.id, metadata: { source: backpack ? 'BACKPACK' : 'MULTI', senderId: sender.publicId } }) });
        if (recipient.agencyId) await tx.agency.update({ where: { id: recipient.agencyId }, data: { commissionCoinBalance: { increment: split.agencyCoins } } });
        prepared.push({recipient, host, split, giftTx});
      }
      // Prepare every recipient before acquiring the shared pool lock. Keep
      // draws in selection order, with the original per-recipient pool rules.
      const outcomes = lucky ? await settleLuckyRewards(tx, prepared.map(({split}) => ({gross:each,contribution:split.luckyPoolCoins})), lucky) : [];
      for (const [index, {recipient, host, split, giftTx}] of prepared.entries()) {
        const outcome = outcomes[index] ?? null;
        const reward = outcome?.rewardCoins ?? 0n; totalLucky += reward;
        if (reward > 0n) {
          await tx.user.update({ where: { id: sender.id }, data: { coinBalance: { increment: reward } } });
          await tx.walletTransaction.create({ data: ledgerData({ userId: sender.id, type: 'LUCKY_GIFT_REWARD', direction: 'CREDIT', title: 'Lucky Gift reward', coins: reward, referenceId: giftTx.id, metadata: { giftId, rewardBps: outcome.multiplierBps, multiplier: multiplierLabel(outcome.multiplierBps), limitedByPool: outcome.limitedByPool } }) });
        }
        progression = await awardGiftProgress(tx, { sender, recipient, gift: giftTx, source: backpack ? 'BACKPACK' : lucky ? 'LUCKY' : 'PAID', gross: each, credit: split.receivedDiamonds, reward, recipientType: host ? 'HOST' : 'NORMAL_USER', origin }) ?? progression;
        results.push({ recipientId: recipient.publicId, transactionId: giftTx.id, createdAt: giftTx.createdAt.toISOString(), recipientDiamonds: split.receivedDiamonds.toString(), luckyRewardCoins: reward.toString(), lucky: outcome ? { rewardCoins: reward.toString(), rewardBps: outcome.multiplierBps, multiplier: multiplierLabel(outcome.multiplierBps), bigWin: outcome.bigWin } : null });
      }
      if (!backpack) await tx.walletTransaction.create({ data: ledgerData({ userId: sender.id, type: 'GIFT_SENT', direction: 'DEBIT', title: `Sent ${gift.name} to ${ids.length} people`, coins: total, referenceId: operation.key, metadata: { source: 'MULTI', roomId, giftId, recipientIds: ids, quantity } }) });
      const balance = await tx.user.findUniqueOrThrow({ where: { id: sender.id }, select: { coinBalance: true } });
      const data = { requestId: operation.key, senderId: sender.publicId, roomId, giftId, recipientIds: ids, quantity, totalCoins: backpack ? '0' : total.toString(), totalGiftCoins: total.toString(), source: backpack ? 'BACKPACK' : 'COINS', bagItemId: backpack ? bagItemId : null, consumedItems: backpack ? itemCount : 0, transactionIds: results.map(r => r.transactionId), recipients: results, senderCoinBalance: balance.coinBalance.toString(), luckyRewardCoins: totalLucky.toString(), giftBatchId, comboId, giftTier: gift.giftTier, catalogCategory: gift.giftCategory };
      await tx.auditLog.create({ data: { action: backpack ? 'BACKPACK_GIFT_SENT' : 'MULTI_GIFT_SENT', category: 'FINANCE', entityType: 'GiftTransaction', entityId: operation.key, description: `${sender.publicId} sent an atomic gift to ${ids.length} recipients.`, metadata: data } });
      const giftSender = { ...senderArtwork, ...(await publicProgression([sender], origin, tx)).get(sender.publicId) };
      const media = { id: gift.publicId, name: gift.name, category: gift.giftTier, ...giftMedia(gift, origin), unitPrice: gift.coinPrice.toString(), quantity, totalCoins: each.toString() };
      for (const result of results) await appendOutbox(tx, `audio-room:${roomId}`, 'gift:received', { ...result, requestId: operation.key, roomId, giftId, giftBatchId, comboId, source: data.source, giftTier: gift.giftTier, catalogCategory: gift.giftCategory, quantity, totalCoins: each.toString(), recipientIds: [result.recipientId], transactionIds: [result.transactionId], sender: giftSender, gift: media });
      return { ...data, gift: media, progression };
    });
    void flushRealtimeOutbox().catch(error => console.error('Outbox flush failed', error.message));
    return giftJson({ success: true, data: response }, 201);
  } catch (error) {
    if (error.message === 'INSUFFICIENT_COINS') return giftJson({ success: false, error: { code: 'INSUFFICIENT_COINS', message: 'Not enough Coins for all recipients.' } }, 409);
    return mobileApiError(error, 'MULTI_GIFT_FAILED');
  }
}
