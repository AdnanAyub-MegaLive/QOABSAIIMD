# Gift resolution after leaving a room

Implementation status: local implementation and automated verification only. Production deployment and two-phone verification remain required. No migration is needed: cancellation fences use the existing unique `GiftRequest(senderId, key)` records. No balances, gifts or rewards were backfilled.

## Endpoint

`POST /api/v1/gifts/resolve`, with the normal mobile Bearer session and version/device headers. Response caching is `private, no-store`. Maximum 100 request IDs per call; existing v1 rate limiting allows 30 calls per minute. Authentication/account restrictions still apply; room membership is not required. The authenticated sender identity is authoritative; clients cannot resolve someone else's request.

```json
{"requestIds":["original-batch-001","original-tap-001","original-tap-002"]}
```

Use original 8–128 character idempotency keys, not the visual combo ID. For a combo, include **every original batch key and every unresolved tap key**, including fallback sends. The portal does not persist the tap list of an uncommitted batch, so resolving only its batch key cannot cancel independently retried tap keys. Persist these IDs until each has a terminal result.

```json
{
  "success": true,
  "data": {
    "results": [
      {"requestId":"original-batch-001","status":"CANCELLED","result":null,"committedAt":null},
      {"requestId":"original-tap-001","status":"COMMITTED","result":{"requestId":"original-tap-001","senderCoinBalance":"900"},"committedAt":"2026-11-02T06:00:00.000Z"},
      {"requestId":"original-tap-002","status":"CANCELLED","result":null,"committedAt":null}
    ]
  }
}
```

The example's committed `result` is illustrative; the actual result is the original complete saved send response data, including Lucky results or batch tap results. Its balance is the historical response balance, not a new wallet snapshot; refresh the wallet rather than applying old balances over newer updates.

## Status and retry rules

- `COMMITTED`: reconcile the original saved result once. Never send or charge it again.
- `CANCELLED`: the request has a durable cancellation fence. Remove it from the pending queue. A delayed send using this key returns HTTP 409 `GIFT_CANCELLED` without charging.
- `PENDING`: no terminal outcome has been confirmed. Retain the original keys and retry resolution. A transaction timeout/conflict returns `retryAfterMs: 1000`; use bounded backoff for network failures and HTTP 429.
- Invalid input returns `VALIDATION_ERROR`; normal session/account/device errors remain unchanged. Never treat HTTP/network failures as confirmed cancellation.

`GET /api/v1/gifts/outcome?requestId=...` remains read-only: absent requests still return `UNKNOWN`. It now also recognizes `CANCELLED` fences. Use POST only when abandoning unresolved sending (leave, switch, recovery/cancel), since POST intentionally prevents unfinished requests from charging.

Cancellation and settlement contend on the same database unique key. If settlement wins, resolution preserves its result. If cancellation wins, any concurrent send's final unique insert fails and its whole transaction rolls back, including all financial changes. Cancellation records must not be deleted by cleanup jobs. Existing fresh-send membership/recipient checks, sender queues, accounting and idempotency remain in place.

Already committed taps survive cancellation of a partially completed combo/fallback. A new batch containing a cancelled tap fails and rolls back its new work; do not retry cancelled taps under new IDs automatically.

## Verification

Automated tests exercise durable cancellation, saved-result replay, sender isolation, combo fallback protection, input validation, timeout handling and a cancellation/send conflict with financial rollback. Isolated PostgreSQL-compatible fixtures verify unique fences and preservation of committed records; no production account data was used. The race test injects the conflict interleaving; it is not a live multi-connection PostgreSQL load test.

Before release, verify on two phones: leave during sending; switch after a lost response; recipient departure; app restart with persisted batch/tap IDs; overlapping moderator-independent room activity; concurrent send/resolve; duplicate retries; and partial combo fallback. Confirm terminal cancellation never charges, committed taps remain intact and pending responses stay queued until resolved.
