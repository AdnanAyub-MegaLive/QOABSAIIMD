# Audio-room gift combo animation timing

## Status and scope

Implemented locally; not deployed or verified on phones. No database migration.
Automated verification: 74 tests passed across nine targeted suites (combo timing,
post-commit/retry handling, outbox payload/delivery, batch routes, progression,
currency settlement, Lucky outcomes and refunds). These are local automated tests,
not production load tests or two-phone animation verification.
This is presentation metadata only. Gift charges, Lucky outcomes, recipient credits,
ledger records, idempotency and transaction retries are unchanged. No past records
are updated. No gifts are suppressed or merged financially.

Supported existing routes: POST `/api/gifts/send` (and its v1 alias),
`/api/v1/gifts/send-multi`, `/api/v1/gifts/backpack/send`.
Existing eligibility still applies: this does not enable Lucky gifts through a
route that previously rejected them. Private-chat and live-video flows are unchanged.

## Request

Send `comboId` (nonblank string, at most 64 characters) on every tap in one combo.
Generate a fresh UUID for a new combo, including after expiry, changing gift,
room or recipient selection. Keep the SAME comboId across taps within that combo.
Each distinct tap needs a NEW Idempotency-Key; a network retry uses the SAME key
and identical body. A quantity of 50 in one request is not 50 animation durations.
`giftBatchId` alone does not opt into combo timing.

## Additive response and realtime contract

Successful HTTP `data` and `gift:received` / `gift:received-multi` event `data`
include the same persisted `comboTiming`:

```json
{
  "comboTiming": {
    "id": "<opaque server-derived combo scope hash>",
    "comboId": "<client combo UUID>",
    "windowMs": 3000,
    "receivedAt": "2026-10-28T12:00:00.000Z",
    "expiresAt": "2026-10-28T12:00:03.000Z"
  },
  "serverTime": "2026-10-28T12:00:00.100Z"
}
```

Existing event names, eventId, transaction IDs, quantities, returns and balances
are retained. `serverTime` is fresh at HTTP serialization/socket emission, including
replays; it is NOT the timer start and must never extend the deadline.
Old saved idempotency results may have no timing. Clients must tolerate absence.

The server scope separates sender, room, gift, recipient set, source route and
comboId. Use the returned opaque `id`, not comboId alone, as the animation key.
No internal account ID is exposed. There is no cumulative quantity/reward snapshot
or sequential revision in this contract. Aggregate only deduplicated confirmed
transactions; never treat a per-tap Lucky multiplier as a whole-combo multiplier.

## Timing semantics

- Fixed 3-second inactivity window (backend constant, no Admin setting added).
- Each new successful request contributes `expiresAt = receivedAt + 3000ms`.
- receivedAt is captured when the authenticated request is converted to a gift
  operation, BEFORE the per-sender transaction queue. It is not a phone timestamp.
- A transaction retry retains this timestamp. An idempotent replay returns the
  originally saved timing and causes no new gift event or charge.
- Failed requests produce no confirmed extension.
- For one combo, retain MAX(expiresAt) across distinct successful taps, never add
  3 seconds per gift and never move the deadline backwards on out-of-order arrival.
- A long-delayed transaction may already be expired when committed/delivered.
  Still process its financial result/chat history, but do not play its animation.
- There is no server timer job or combo-ended event. Apps stop locally at the
  authoritative deadline even if the socket disconnects.

## Required app work (RN and Kotlin)

1. Maintain one active visual per combo scope, not a FIFO of one full animation
   per transaction. Update the count and confirmed return display in place.
2. Use serverTime to estimate server clock offset, preferably using HTTP request
   midpoint/RTT and a monotonic clock. Socket timing is approximate by transit
   latency. Never assume the phone wall clock is correct.
3. Compute remaining = expiresAt - estimatedServerNow. End the animation and
   circular timer together at zero; cancel queued/looping visual work for this combo.
4. Merge sender optimistic preview with HTTP confirmation and room socket event.
   Deduplicate events by eventId and the same logical send by requestId/transaction
   IDs; one send can arrive through both transports. Multi-recipient sends should
   not become one animation per recipient. Roll back optimistic state on failure.
5. A late event with an expired deadline must never restart playback. Still update
   confirmed count/accounting UI once. A newer live deadline may extend an active
   combo. Use a new comboId when starting after expiry.
6. Keep sending controls independent of playback state. Never disable the room's
   gift picker or other senders while an animation plays. Use bounded visual lanes
   or coalescing when multiple senders animate; do not accumulate an unlimited queue.
7. Do not await animation completion before sending the next network request.
   Preserve normal balance checks and same-key retries for uncertain responses.
8. Do not replay old animations on reconnect/history fetch. Refetch wallet/history
   when needed; presentation expiry is not cancellation or refund.

## Backend concurrency and limits

The existing queue is per sender, not per room. Post-commit gift emission remains
asynchronous, with durable outbox fallback. The new feature adds no locks, tables,
database queries or writes beyond metadata in existing result/outbox JSON.
The shared Lucky pool row and common recipient updates can still contend under
load. This change does not claim to remove that contention or guarantee subsecond
settlement. Diagnose request latency separately from animation backlog.

## Verification before release

- 50 quick taps: one live combo animation/count; it stops 3 seconds after the
  last eligible request timestamp, not after 50 complete animations.
- Another sender sends Normal and Lucky gifts during the combo: picker stays
  usable; inspect HTTP latency and socket arrival independently from playback.
- Retry the same key, replay after expiry, reorder events and deliver duplicates:
  no extra charge/count/extension, no stale animation restart.
- Send two independent combos with the same client ID from different senders:
  returned scopes differ and do not merge.
- Delayed processing beyond expiry: financial success remains visible; no replay.
- Multi-recipient and backpack gifts: same timing semantics, existing eligibility.
- Insufficient balance and transaction failure: no confirmed animation extension.
- Compare two phones with intentionally different wall clocks; both use server
  timing and stop promptly. Verify both sender local preview and receiver playback.

Deployment requires a rebuild/restart only. Deploy backend before enabling this
contract in the apps. Old apps continue receiving their existing fields but will
not fix their animation queues until the app changes ship.
