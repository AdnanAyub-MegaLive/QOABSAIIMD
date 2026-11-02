import { CANCELLED_GIFT_FINGERPRINT, giftRequestStatus } from './gift-request-state.js';
const validKey = key => typeof key === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(key);
export function resolutionKeys(body) {
  const ids = body?.requestIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(key => !validKey(key)))
    throw Object.assign(new Error('Provide 1–100 original request IDs, including batch and tap IDs for combos.'), {code:'VALIDATION_ERROR'});
  return [...new Set(ids)];
}
export async function resolveGiftRequests(db, senderId, body) {
  const keys = resolutionKeys(body);
  try {
    return await db.$transaction(async tx => {
      // ON CONFLICT waits for a competing settlement. If our insert wins, the
      // sender's final unique insert fails and rolls back its ENTIRE transaction.
      // Never delete these fences or replace them with successful requests.
      await tx.giftRequest.createMany({data:[...keys].sort().map(key=>({senderId,key,fingerprint:CANCELLED_GIFT_FINGERPRINT})),skipDuplicates:true});
      const rows = await tx.giftRequest.findMany({where:{senderId,key:{in:keys}}});
      const byKey = new Map(rows.map(row=>[row.key,row]));
      return {results:keys.map(requestId=>{
        const row=byKey.get(requestId),status=giftRequestStatus(row);
        return {requestId,status,result:status==='COMMITTED'?row.result:null,
          committedAt:status==='COMMITTED'?row.createdAt.toISOString():null};
      })};
    }, {isolationLevel:'ReadCommitted',maxWait:3000,timeout:5000});
  } catch(error) {
    // A timeout/aborted transaction cannot prove cancellation. The caller must
    // retain pending IDs and resolve again; never generate a replacement key.
    if (['P2028','P2034','P2002'].includes(error?.code))
      return {results:keys.map(requestId=>({requestId,status:'PENDING',result:null,committedAt:null})),retryAfterMs:1000};
    throw error;
  }
}
