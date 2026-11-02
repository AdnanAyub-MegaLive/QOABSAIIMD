import { CANCELLED_GIFT_FINGERPRINT } from './gift-request-state.js';
export async function readGiftOutcome(db, senderId, key) {
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(key))
    throw Object.assign(new Error("Use the original 8–128 character Idempotency-Key."), { code: "VALIDATION_ERROR" });
  const row = await db.giftRequest.findUnique({ where: { senderId_key: { senderId, key } }, select: { result: true, createdAt: true, fingerprint:true } });
  if(row?.fingerprint===CANCELLED_GIFT_FINGERPRINT)return {requestId:key,status:'CANCELLED',result:null,committedAt:null};
  // Absence is not proof of failure: a concurrent transaction may still commit.
  return { requestId: key, status: row?.result ? "COMMITTED" : "UNKNOWN", result: row?.result ?? null, committedAt: row?.result ? row.createdAt.toISOString() : null };
}
