import { prepareMultiGift } from '@/lib/multi-gift-settlement';
import { giftOperation, priorGiftOperation, runGiftOperation, flushRealtimeOutbox } from '@/lib/gift-operation';
import { mobileApiError, giftJson, mobileOptions, requireMobileUser } from '@/lib/mobile-api';

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
    const prepared = await prepareMultiGift(sender, body, request);
    operation.contentionKeys = prepared.contentionKeys;
    const response = await runGiftOperation(sender.id, operation, tx => prepared.settle(tx, operation));
    void flushRealtimeOutbox().catch(error => console.error('Outbox flush failed', error.message));
    return giftJson({ success: true, data: response }, 201);
  } catch (error) {
    if (error.message === 'INSUFFICIENT_COINS') return giftJson({ success: false, error: { code: 'INSUFFICIENT_COINS', message: 'Not enough Coins for all recipients.' } }, 409);
    return mobileApiError(error, 'MULTI_GIFT_FAILED');
  }
}
