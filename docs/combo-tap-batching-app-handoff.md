# Audio-room combo tap batching

## Status

Implementation complete; production deployment and physical-phone verification are pending. No production records, existing balances or past rewards were changed. No schema migration is required: both batch and tap receipts use the existing `GiftRequest` table and its `(senderId, key)` uniqueness constraint.

## Endpoint and request

`POST /api/v1/gifts/send-combo` (alias `/api/gifts/send-combo`). Use the existing mobile Bearer token and device/session checks. Responses are `no-store`.

```http
Idempotency-Key: combo-batch-00001
Content-Type: application/json
Authorization: Bearer <mobile token>
```

```json
{
  "roomId": "ROOM-123",
  "giftId": "AST-123",
  "recipientIds": ["USR-123", "USR-456"],
  "quantity": 1,
  "comboId": "combo-session-001",
  "giftBatchId": "combo-session-001",
  "tapIds": ["combo-tap-00001"]
}
```

- `tapIds` are ordered, durable identities for individual taps; generate and persist each before sending it. The batch header key identifies this exact ordered request. Both kinds of key use 8–128 characters from `A-Z a-z 0-9 . _ : -`. Keys must not equal each other within a batch.
- 1–8 distinct taps, 1–26 distinct recipients, and at most **52 tap/recipient pairs** per request. For 26 recipients this means at most two taps. The server rejects oversized requests without settlement.
- One batch has one room, gift, recipient selection and quantity. Split when these change. `quantity` defaults to 1 and allows 1–999 per recipient **per tap**; never convert N taps into `quantity: N` because that changes the draw semantics.
- `comboId` is required, up to 64 characters. `giftBatchId` is optional, up to 64 characters. Keep the same presentation IDs throughout the combo; neither is a financial deduplication key.
- Supports paid `LUCKY`, `CLASSIC`, `PREMIUM` and `VIP` audio-room gifts. Backpack, blind boxes, chat and live-video gifts remain on their existing endpoints. No endpoint switch should happen before this route is deployed.
- The sender and every recipient must be present in the live audio room. Existing recipient eligibility, account/session/device checks, financial policies and conditional balance debits remain in effect.

## Result

New batches return 201. An exact saved batch retry returns 200 (a concurrent replay may return 201). Both are success.

```json
{
  "success": true,
  "data": {
    "requestId": "combo-batch-00001",
    "senderCoinBalance": "900",
    "taps": [
      {
        "tapId": "combo-tap-00001",
        "result": {
          "requestId": "combo-tap-00001",
          "roomId": "ROOM-123",
          "giftId": "AST-123",
          "recipientIds": ["USR-123", "USR-456"],
          "quantity": 1,
          "totalCoins": "200",
          "totalGiftCoins": "200",
          "source": "COINS",
          "transactionIds": ["gift-001", "gift-002"],
          "senderCoinBalance": "900",
          "luckyRewardCoins": "100",
          "recipients": [
            { "recipientId": "USR-123", "transactionId": "gift-001", "createdAt": "2026-10-30T07:00:00.000Z", "recipientDiamonds": "10", "luckyRewardCoins": "100", "lucky": { "rewardCoins": "100", "rewardBps": 10000, "multiplier": "1", "bigWin": false } },
            { "recipientId": "USR-456", "transactionId": "gift-002", "createdAt": "2026-10-30T07:00:00.001Z", "recipientDiamonds": "10", "luckyRewardCoins": "0", "lucky": { "rewardCoins": "0", "rewardBps": 0, "multiplier": "0", "bigWin": false } }
          ]
        }
      }
    ]
  }
}
```

This example uses one tap; the actual `taps` array contains **every requested tap in order**, including replays. Each `result` is the existing send-multi result, also carrying gift media, progression, gift tier, catalog category, presentation IDs and `comboTiming`. Monetary values are decimal strings. `recipients` preserves the original successful recipient order. Each tap's `senderCoinBalance` is its historical post-tap value. The outer balance is the batch's post-commit value; replaying a saved batch returns its saved balance, not a new wallet read. Do not overwrite a newer wallet revision with a historical HTTP result; keep using realtime wallet revisions/refetch for reconciliation.

## Accounting and retries

- All **new** taps in a batch commit atomically in one Serializable transaction. A failure rolls them all back, including Lucky pool effects, recipient credits, progression, recovery snapshots, outbox events and saved receipts. Previously committed taps in an overlapping batch remain unchanged.
- Process taps in request order. Each tap conditionally debits its full cost, runs an independent Lucky draw for every recipient, and credits its return. A return from an earlier tap can fund a later tap, as with sequential sends. If any later debit fails, the entire set of new taps rolls back.
- Pool balance, collected amount and payouts follow the same sequential draw rules and limits. The batch locks/reads the pool once, maintains its running balance within that transaction, then writes it once before commit. Odds and recipient Diamond calculations are unchanged.
- Every tap has its own durable saved result. If batches `[A,B]` and `[B,C]` overlap, B is replayed and only C settles in the second batch. No second draw, credit, debit or gift event is generated for B.
- Retrying an unknown outcome must retain the batch key and identical body. Never invent replacement tap IDs after a timeout. If splitting/repacking pending taps, use a new batch key but retain their original tap IDs, gift, recipients, quantity and presentation IDs.
- Tap keys share the existing **send-multi** idempotency namespace. A send-multi retry must use the same content. Keys already used by single-send (`PAID`) or another operation conflict safely; do not migrate unresolved single-send requests to this endpoint. Finish recovery through their original endpoint.
- The batch receipt also uses the shared namespace. Do not reuse batch keys as tap keys or vice versa.
- An identical key with different contents returns `409 IDEMPOTENCY_CONFLICT`. Do not retry it under a fresh tap key; reconcile the original operation instead.
- `409 INSUFFICIENT_COINS`: no new taps in that batch committed. The app can stop the combo or offer a smaller batch with a new batch key and the original tap IDs.
- `422 VALIDATION_ERROR`, existing room/gift/recipient errors and existing authentication errors retain the normal error envelope. `429 RATE_LIMITED` applies after 300 new batch attempts per account per minute per server process. Back off and retain IDs.
- `503 GIFT_RETRY_REQUIRED` means database conflict retries were exhausted. Retry the same request after backoff. A network/5xx outcome must be treated as unknown, never as permission to replace IDs.
- Immediate realtime delivery remains outside the transaction. A delivery failure does not turn a committed purchase into a failed charge. Existing outbox/eventId recovery remains active.

## App scheduling and animation

1. Keep immediate per-tap `audio-room:gift-preview` and the existing combo animation timer. Tapping extends the local timer; stop animations when it ends. Do not wait for settlement to show previews.
2. Keep a durable per-account queue. Persist taps and the outbound batch envelope before sending. A single atomic durable write can record multiple queued taps if the app's storage supports it; do not remove crash recovery guarantees.
3. Allow one batch request in flight per sender. While it runs, collect new taps. When it completes, drain a small ordered batch (start with 2–4 taps; obey the 52-pair cap). Do not wait until the combo ends or accumulate all 50/500 taps into one request. A short ~100–200 ms collection window when idle is an app tuning choice.
4. Save all returned tap receipts atomically before removing them from the pending queue. Recover an interrupted response with the same batch key/body, then continue.
5. Each recipient still receives existing `gift:received` events with the **tap ID in `requestId`**, not the batch request key. Preserve eventId/transactionId deduplication. Settled events add confirmed reward/accounting data; never restart an expired animation because a batch settled late.
6. `comboTiming.receivedAt` is server receipt time, not the physical tap time. It is presentation metadata, not a spending timestamp or permission to replay old flights. Do not use batch receipt to revive a combo already ended by the app.
7. Pending tap queue, receipts and in-flight requests must be account scoped. Clear the active UI on logout without losing recovery records for that account.

## Verification and deployment

**92 tests passed across 9 targeted suites.** Automated coverage includes actual isolated PostgreSQL-compatible SQL transactions for overlapping/replayed batches and rollback, request validation/auth/rate limiting, independent per-recipient results/ledger/event references, one pool read/write, unchanged single/multi routes, and existing conflict/post-commit protections. Tests do not connect to production or modify existing users.

Deployment: pull this implementation, then rebuild/restart the server; no new migration. Verify route availability before enabling the app batching feature.

Still required after deployment: two-phone fast combo, timeout/restart recovery, overlapping retry, and sustained five-QA-sender load. Measure last-tap-to-last-reward delay, per-batch p50/p95/max, event duplicates, wallet debits/credits, recipient Diamonds, pool collected/payout/balance and recovery snapshots. This implementation reduces repeated request/auth/preflight/transaction/policy/pool overhead but does not claim a measured latency target yet. The existing global Lucky pool and per-sender contention protections remain; bounded batches avoid holding them for an entire long combo.
