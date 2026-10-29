# Lucky combo previews — Spec 149

Send `audio-room:gift-preview` on each tap with the existing roomId, giftId,
giftBatchId, recipientIds and quantity. Keep giftBatchId stable for the combo.
Supply a unique previewId per tap (1–128 letters, digits, dots, underscores,
colons or hyphens); reuse it only when retrying that same tap. requestId is
accepted as a fallback. Legacy clients without either ID still relay each tap.

Successful acknowledgements contain success:true and data with previewId,
giftBatchId and expiresAt. Duplicate tap acknowledgements contain duplicate:true.
Failures contain success:false and error.code, including PREVIEW_RATE_LIMITED,
PREVIEW_EXPIRED and existing validation/access errors. A failed preview must not
prevent a financial send or trigger another financial charge.

Receivers get the existing event and payload plus previewId. The synthetic
transactionId is `preview:<previewId>`; it is not a committed transaction ID.
Deduplicate previews by previewId, group animations by sender and giftBatchId,
and extend the combo on each fresh tap. Stop at expiry; do not queue one full
animation per settlement. Preview lifetime is three seconds. Delivery is volatile
and may be lost. Only committed settlement events establish rewards, balances,
history and rankings. Reconcile those events with the existing combo/request
identifiers without replaying each already-previewed animation.

The backend retains conditional financial debits, Serializable isolation,
sender queues, idempotency and rollback/retry behavior. It reuses records already
read or created in the same transaction for recovery and progression, and skips
two task-definition reads whose gift metrics are calculated from committed gifts.
No odds, pool limits or existing balances are changed.

Production investigation on 29 October 2026 confirmed cfb4323 was deployed:
the first QA preview arrived, while the second using the same batch timed out.
The defect was batch-level deduplication, not absence of the relay. No financial
requests were sent in that test. These fixes still require deployment and a
two-phone test. Under-250 ms settlement latency has not been verified.

After deployment, send a 77-tap combo and simultaneous combos from separate
senders. Check every preview acknowledgement, receiver preview acceptance,
per-tap deduplication and timely animation expiry. Measure settlement p50/p95
separately from preview latency; validate totals and replayed request keys using
dedicated funded QA accounts only.
