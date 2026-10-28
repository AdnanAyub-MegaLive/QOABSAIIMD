# Spec 145: atomic room multi-gift

## Status
Implemented locally. Not pushed, deployed, or verified on two phones. Do not
switch production clients until backend deployment and QA are confirmed.
No database migration; no existing balances or records were changed.

## Request
`POST /api/v1/gifts/send-multi`, normal mobile Bearer authentication.
Use an 8–128 character `Idempotency-Key` (letters, digits, `.`, `_`, `:`, `-`).
Legacy `requestId` in the body remains supported when the header is absent.

```json
{
  "roomId": "ROOM-123",
  "giftId": "AST-rose",
  "recipientIds": ["USR-A", "USR-B"],
  "quantity": 1,
  "giftBatchId": "batch-123",
  "comboId": "combo-123"
}
```

1–26 unique recipients, in selection order; duplicate IDs count once.
Quantity (1–999) is per recipient. Sender and every recipient must be present.
Supports CLASSIC, PREMIUM, VIP and LUCKY. No chat/live-video targets here.

For backpack sending, add `bagItemId` from `GET /api/v1/gifts/backpack`.
The new field is the gift's public asset ID because inventory has no standalone
row ID. `giftId` may be omitted; if present it must match `bagItemId`.
Inventory ownership is always scoped to the authenticated sender.
Required items = quantity × unique recipient count. Backpack sends charge no
Coins and, matching the existing backpack endpoint, do not award Lucky returns,
even if the stored gift tier is LUCKY.

## Response
201 `{ "success": true, "data": { ... } }`, with:
- `requestId`, `roomId`, `giftId`, `quantity`, `recipientIds`, `transactionIds`.
- `source`: COINS or BACKPACK; `bagItemId`, `consumedItems`.
- `totalCoins`: actual debit ("0" for backpack).
- `totalGiftCoins`: recorded catalogue value of all delivered gifts.
- `senderCoinBalance`: final balance including all Lucky returns.
- `luckyRewardCoins`: sum of the sender's Lucky returns for this batch.
- `recipients`: ordered entries with `recipientId`, `transactionId`, `createdAt`,
  `recipientDiamonds`, `luckyRewardCoins`, and `lucky` (null or the usual
  `rewardCoins`, `rewardBps`, `multiplier`, `bigWin` object).
- Existing gift artwork, progression and batch fields remain available.

All coin/Diamond amounts are decimal strings. Lucky returns belong to the sender,
not the recipient. Each paid Lucky recipient has a separate draw, settlement,
reward ledger reference and recovery snapshot inside the one transaction.

## Atomicity and retries
The complete cost is reserved before any recipient payout. Insufficient Coins
(`INSUFFICIENT_COINS`) or inventory (`BACKPACK_INSUFFICIENT`) rejects the batch.
Any later error rolls the transaction back. Never split/retry individual members
of a failed batch. Retry the same request with the same key; a successful replay
returns the saved result without a new draw, debit or emission. Changing bag
funding with the same key conflicts. Existing key fingerprint semantics treat
recipient IDs as a set: a reordered retry returns the original saved order.
Serialization retries and post-commit outbox delivery protections are retained.

## Realtime
One `gift:received` event per recipient, with the existing event envelope and
unique outbox `eventId`, released only after commit. No additional
`gift:received-multi` event is emitted (avoids duplicate animations).
Deduplicate by `eventId`/transaction ID, NOT by requestId: all recipients share
the same requestId. Keep the existing combo timer handling. One atomic commit
does not guarantee identical rendering timestamps on different phones.

## Verification
Local mocked route tests cover 26 Lucky recipients, ordered results, one debit,
per-recipient draws/events/returns, insufficient funds/items, bag spending and
27-recipient rejection. Operation tests cover source-sensitive fingerprints,
per-recipient recovery, replays, serialization retries and post-commit failures.
Real PostgreSQL rollback/concurrency, deployed 26-person performance and two-phone
animation timing remain acceptance checks. Use dedicated funded QA accounts only.
