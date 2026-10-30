import { createHash } from 'node:crypto';
import { giftOperation } from './gift-operation.js';

export const MAX_COMBO_TAPS = 8;
export const MAX_COMBO_GIFTS = 52;
const invalid = message => Object.assign(new Error(message), { code: 'VALIDATION_ERROR' });

export function comboBatchOperation(body, key) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Provide a combo batch.');
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw invalid('Use an 8–128 character Idempotency-Key.');
  if (typeof body.roomId !== 'string' || !body.roomId || body.roomId.length > 120 ||
      typeof body.giftId !== 'string' || !body.giftId || body.giftId.length > 128 ||
      typeof body.comboId !== 'string' || !body.comboId.trim() || body.comboId.length > 64 ||
      body.liveId || body.conversationId || body.bagItemId)
    throw invalid('Provide an audio room, paid gift and comboId.');
  const ids = body.recipientIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 26 || new Set(ids).size !== ids.length ||
      ids.some(id => typeof id !== 'string' || !id || id.length > 128))
    throw invalid('Provide 1–26 distinct recipients.');
  const quantity = body.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw invalid('quantity must be 1–999.');
  if (!Array.isArray(body.tapIds) || !body.tapIds.length || body.tapIds.length > MAX_COMBO_TAPS ||
      body.tapIds.length * ids.length > MAX_COMBO_GIFTS || new Set(body.tapIds).size !== body.tapIds.length ||
      body.tapIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(id) || id === key))
    throw invalid('Provide 1–8 unique tapIds, distinct from the request key; at most 52 tap/recipient pairs.');
  // Share the existing MULTI key namespace. Moving a tap between batches (or
  // retrying it through send-multi) cannot debit it twice. SINGLE keys conflict.
  const taps = body.tapIds.map(id => giftOperation(body, id, 'MULTI'));
  const fingerprint = createHash('sha256').update(JSON.stringify({ mode: 'COMBO_TAPS',
    taps: taps.map(tap => [tap.key, tap.fingerprint]) })).digest('hex');
  return { key, fingerprint, taps };
}
