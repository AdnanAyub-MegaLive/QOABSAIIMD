# Confirmed wallet, room totals and presentation delivery

Implementation validated for release, 29 October 2026. Production deployment and real-device verification are outstanding. No production data, balances, rewards or financial history were changed during implementation.

## Private wallet update

Listen for `wallet:updated` on the existing authenticated Socket.IO connection. The server routes it only to `user:<current public ID>`.

```json
{"success":true,"data":{"eventId":"opaque-sha256-id","userId":"USR-2030151","walletRevision":"1842","reason":"BALANCE_CHANGED","transactionId":null,"balances":{"coins":"9674723","diamonds":"9440624","businessCoins":"0","coupons":"0"},"serverTime":"2026-10-29T12:00:00.000Z"}}
```

- All four balances and the revision are decimal strings. Coins are personal Coins; Diamonds are the host Diamond balance; businessCoins are the distinct reseller wallet; coupons are coupon units. They are absolute values, not increments. Never interpret a missing field as zero.
- `reason` is deliberately generic. A transaction may change several balances or include several ledger rows; `transactionId` is null rather than a misleading ledger reference. This event updates balances, not transaction history or gift animation/reward attribution.
- The database increments `walletRevision` on changes to these four User balance columns, in the same transaction. Several changes in one transaction produce one final event per affected user; revision gaps are valid. Rollbacks produce no durable event or wake. A replay that performs no balance mutation produces no new event.
- Coverage includes existing gifts, Lucky credits, transfers/self-recharge, exchanges, withdrawals/redemptions, refunds, admin adjustments, task/login/other rewards and game settlements **when they mutate these columns**. A payout status change without a balance change does not create a balance event. Initial account creation uses revision zero; read its initial wallet. No financial logic was replaced.
- `GET /api/wallet` and its existing v1 alias return `data.walletRevision`, `data.balances` and `serverTime`, alongside all existing fields. Balances and revision come from the same User row read.
- On connection/reconnection/account switch, fetch the wallet. Compare revisions as integers/BigInt or exact decimal strings, never floating-point numbers. Apply only newer revisions; an initial empty local state accepts zero. An older HTTP response must not overwrite a newer socket update. Clear state across accounts. Treat `eventId` as opaque and deduplicate it.

## Room gift totals

Listen for `audio-room:gift-totals` after joining the room through the existing authenticated flow:

```json
{"success":true,"data":{"eventId":"opaque-sha256-id","roomId":"0001","scope":"ALL_TIME_RECORDED_GIFT_COINS","recipientScope":"CHANGED","roomTotalsRevision":"921","roomTotalCoins":"125000","recipients":[{"userId":"USR-2030146","receivedGiftCoins":"45000","revision":"921"}],"serverTime":"2026-10-29T12:00:00.000Z"}}
```

- Scope matches the existing all-time room gift history/leaderboard: sum of committed `GiftTransaction.coinValue` with a room ID and no `reversedAt`. It is recorded gift value, including recorded backpack value; it is **not** net wallet spending, Lucky returns, Diamonds, salary, or Daily/Weekly/Monthly ranking score. Multi-recipient rows contribute their recorded attributed shares once. No catalogue-price recalculation.
- Existing reversal markers remove the original contribution. Changes to recorded coinValue reconcile the difference; this does not introduce a new refund facility. Removed records also reconcile derived totals.
- Only changed recipients appear in events. IDs are public user IDs, never seat numbers. Deleted/inactive users are omitted from recipient identity lists; the room's historical total is retained. A recipient without a User mapping contributes to the room total only.
- Coalescing is intentional: many committed gifts may produce a single absolute numeric update. Gift animations and per-gift results retain their existing events.
- **Ordering:** compare roomTotalsRevision for the room total, and compare each recipient's `revision` separately. Do not discard every recipient in an older room event: it may contain a recipient absent from a newer event. Example: room revision 12 updates B; late revision 11 can still update A while the room total remains at 12. For a recipient, ignore revisions at or below its latest revision/snapshot baseline.

Reconnect snapshot:

`GET /api/v1/audio-rooms/{roomId}/gift-totals` (also `/api/audio-rooms/{roomId}/gift-totals`). Uses existing mobile session checks and the room-ranking room-access gate (active membership for visitors, bans, owner blocks, room status). Limit: 60 requests per minute per user. Response is private/no-store.

```json
{"success":true,"data":{"roomId":"0001","scope":"ALL_TIME_RECORDED_GIFT_COINS","recipientScope":"ALL","roomTotalsRevision":"921","roomTotalCoins":"125000","recipients":[{"userId":"USR-2030146","receivedGiftCoins":"45000","revision":"921"}],"pendingUpdates":false,"serverTime":"2026-10-29T12:00:00.000Z"}}
```

The snapshot contains all nonzero, resolvable active-user recipient totals. Missing recipients in a complete snapshot have zero at that snapshot revision. It uses a consistent Repeatable Read view. Establish its revision as the baseline for all recipients, while retaining any locally received higher revisions. Empty rooms return successful zero/empty data. Missing schema returns unavailable, not fabricated zeros. `pendingUpdates:true` means additional committed deltas await folding: retain displayed values and quietly refetch with backoff. Do not label a pending snapshot fully caught up. Fetch on reconnect/room switch, not after every gift.

## Delivery and contention

Wallet events are persisted with balance mutations. Room gift transactions append a transaction-specific delta; they do not lock a shared room aggregate. A separate short worker folds at most 100 deltas per room, for at most 20 rooms per pass, advances a room revision, writes the absolute event and marks those deltas processed atomically. Retries cannot apply a processed delta twice. Snapshot reads can also fold a bounded batch for their room.

PostgreSQL NOTIFY wakes workers only after commit. Payloads contain a wake kind, no balances/content. Numeric events have an independent outbox/worker with no leaderboard or media enrichment. Room folding runs independently of wallet dispatch. The 250ms fallback remains available during listener reconnection. Events retain durable IDs; successful socket emission is followed by a batched delivery-marker update. An emission failure leaves events pending. A marker failure may produce replay after restart; use revision/event dedup. Emit success does not prove phone receipt. Reconnect HTTP snapshots are authoritative recovery.

Global announcements keep `global:announcement`, original IDs, occurrence/expiry times, thresholds, cooldowns and audience checks. Gift recovery/settled-game writes wake the collector after commit, with the one-second recovery timer retained. Dispatch is bounded to ten independent candidates so one slow audience lookup does not block its peers. Overlapping collector wakes request another pass. No extra rewards or unconditional gift broadcasts.

Notifications retain `notification:new` and their public IDs, retraction locking and durable rows. Inserts wake the existing dispatcher after commit; its two-second recovery timer remains. Apps should continue deduplicating by notification ID.

## Diagnostics and measurement

Set `REALTIME_TIMINGS=true` temporarily to log structured numeric stage timings, without tokens, balances or message text. Gift operation traces cover queue entry, transaction start and commit. HTTP DM traces cover request arrival, auth, membership/input, sender-perks resolution, persistence and socket publication. DM persistence, IDs, ordering, receipts and recovery were not changed; no latency cause has been asserted from inspection alone.

Numeric event logs identify the triggering worker (`post_commit` or `fallback`), event ID, emission wall time and persisted-to-emit age. **Persisted-to-emit includes transaction duration and is not commit-to-emit latency.** Coalesced wakes can share a worker pass. For true commit-to-emit percentiles, use a controlled QA harness recording transaction completion and matching emitted event IDs; do not relabel the available age metric.

No production p50/p95/p99 or device receipt/render measurements are available from this implementation task. The proposed p95 <100ms commit-to-emit remains an unverified target. Measure request→commit, commit→emit, emit→device receipt and receipt→visible update separately, including app banner queue delay. Correlate events by opaque ID; synchronize wall-clock offsets instead of comparing unrelated monotonic clocks. Socket-based DM timing is not covered by the HTTP-route trace.

## Migration and rollout

Required migration: `20261030010000_confirmed_realtime`. It adds walletRevision, the numeric outbox and derived room tables/triggers. It initializes derived totals from existing gift history without modifying gifts, balances or awarding historical rewards. The migration takes a write lock on GiftTransaction during initialization; schedule deployment according to dataset size. Do not run a seed/reset/backfill reward job.

Apply migration before starting this code; generate Prisma, rebuild, restart the custom Node/Socket.IO server. `REALTIME_DATABASE_URL` is optional and defaults to DATABASE_URL. It must point to the **same database** through a direct or session-pooling connection supporting LISTEN; transaction pooling is unsuitable. Do not disable TLS validation. If listening fails, the worker logs a safe warning and polling continues.

Production revision, migration parity, restart and device results still require verification after deployment. Pushing the release to Git does not apply its migration or restart production.

## Verification performed

Targeted automated suite: 100 tests passed across 14 files. Tests include isolated in-memory PostgreSQL-compatible migration execution, unchanged balance/history baseline, large integer precision, rollback/no-op balance updates, one event per affected user/transaction, multi-recipient contributions, duplicate insert, reversal/value correction, 250 contributions folded as 100/100/50 exactly once, private channel routing, opaque stable IDs, socket failure, marker failure, overlapping wakes, slow-announcement independence, room endpoint authentication/access/rate limiting/missing schema and existing gift/refund/message/outbox/announcement protections. No configured database was used by the new SQL tests.

Production build passed with the pre-existing broad file-tracing warning in event storage. Prisma validation and targeted lint passed. These are not a production load test, a multi-connection PostgreSQL contention test or two-phone acceptance. Before enabling app use, verify concurrent senders, reconnect snapshots while gifts are in flight, stale HTTP versus socket ordering, real PG listener reconnect, refunds and the four latency stages using dedicated QA accounts.
