import { comboBatchOperation } from '@/lib/gift-combo-batch';
import { priorGiftOperation, runGiftOperation } from '@/lib/gift-operation';
import { prepareMultiGift } from '@/lib/multi-gift-settlement';
import { giftJson, mobileApiError, mobileOptions, requireMobileUser } from '@/lib/mobile-api';
import { isRateLimited } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const OPTIONS = mobileOptions;
export async function POST(request) {
  try {
    const sender = await requireMobileUser(request);
    let body;
    try { body = await request.json(); }
    catch { throw Object.assign(new Error('Provide a JSON combo batch.'), { code: 'VALIDATION_ERROR' }); }
    const operation = comboBatchOperation(body, request.headers.get('Idempotency-Key'));
    const replay = await priorGiftOperation(sender.id, operation);
    if (replay) return giftJson({ success: true, data: replay }, 200);
    if (isRateLimited(`gift-combo:${sender.id}`, { limit: 300, windowMs: 60_000 }))
      return giftJson({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many combo batches. Retry with the same IDs shortly.' } }, 429);
    const prepared = await prepareMultiGift(sender, body, request, { batch: true });
    operation.contentionKeys = prepared.contentionKeys;
    operation.finalize = prepared.finalize;
    const result = await runGiftOperation(sender.id, operation, (tx, tap) => prepared.settle(tx, tap));
    return giftJson({ success: true, data: result }, 201);
  } catch (error) {
    if (error.code === 'ROOM_NOT_LIVE' || error.code === 'GIFT_RECIPIENT_CHANGED')
      return giftJson({ success: false, error: { code: error.code, message: error.message } }, 409);
    if (error.message === 'INSUFFICIENT_COINS') return giftJson({ success: false, error: {
      code: 'INSUFFICIENT_COINS', message: 'Not enough Coins to complete the batch. No new taps were charged.' }, }, 409);
    return mobileApiError(error, 'COMBO_GIFT_FAILED');
  }
}
