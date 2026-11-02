// Gift fingerprints are SHA-256 hex. This reserved non-hex value is a durable
// cancellation fence in the SAME sender/key unique index used by settlement.
export const CANCELLED_GIFT_FINGERPRINT = 'TERMINAL:CANCELLED:v1';
export function giftRequestStatus(row) {
  return row?.fingerprint === CANCELLED_GIFT_FINGERPRINT ? 'CANCELLED' : row?.result ? 'COMMITTED' : 'PENDING';
}
