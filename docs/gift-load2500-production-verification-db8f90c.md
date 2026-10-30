# Sustained Lucky settlement verification — 30 October 2026

## Deployed changes

Production code: `db8f90c`, incorporating `4b0613f` and `aedd4ac`. Both Git remotes received the changes. Production builds passed; no migrations, backfills, seeds or historical reward runs were required.

- Batch the single-send wallet journal inserts inside the existing financial transaction.
- Insert the completed idempotency result once, retaining the unique sender/key constraint and rollback on a competing insert.
- Use the conditional debit's returned balance instead of rereading it. Lucky credits remain in the same transaction.
- Reuse progression snapshots produced by the transaction, including both tracks for self-gifts; retry attempts cannot share snapshots.
- Use indexed room IDs and metadata-only room relations for the PK lookup.
- Fetch only artwork metadata for Lucky previews, not stored animation bytes.
- Batch suppressed announcement receipts, keeping visible announcements sequential for cooldown correctness.
- Prune delivery deduplication maps at most once per second instead of scanning them on every gift. Delivery IDs and duplicate protection remain intact.

Serializable isolation, conditional balance/inventory debits, sender/recipient scheduling, exact integer accounting, recovery records, Lucky odds, pool limits and retry rules remain in place.

## Automated verification

123 tests passed in 12 focused suites: gift postcommit, routes, PostgreSQL adapter, sender payload, settlement, Lucky draws, refunds, progression, outbox, confirmed realtime, announcements and previews. Production build passed.

## Test method

Five new dedicated QA senders send 500 one-unit Lucky gifts each, concurrently, to one new QA receiver in a private/password room. This deliberately exercises contention on the same recipient. Each sender has one original request in flight at a time. Every hundredth send is replayed twice concurrently with the same key: 2,500 unique gifts plus 50 replay requests. Replays must preserve the saved result, excluding the transport's fresh serverTime. A conflicting payload under an existing key must be rejected.

The harness verifies database gift/settlement/idempotency counts, exact wallet balances and totalSpent, ledger debits/credits, settlement allocation, room totals, Lucky pool changes, and one receiver event per gift. QA rooms are closed afterwards; QA transaction history is retained. Only fresh QA accounts were funded. No existing user was funded, debited, refunded or edited by these tests; no past rewards were awarded.

Requests and Socket.IO measurements run from the droplet through the public HTTPS endpoint. These are backend measurements, not physical-phone animation or mobile-network measurements. Normal production background work remains enabled. The final run has detailed timing logs and CPU profiling disabled.

## Earlier diagnostic runs

- On `aedd4ac`, run `qa-load2500-54ee07a4`: uninterrupted 2,500 gifts, 50 successful replays, no duplicate receiver events. 258.257 seconds; HTTP median 426ms, p95 868ms, p99 2,266ms, max 4,408ms. Spent 250,000 Coins, returned 151,000 Coins, credited 25,000 Diamonds. Pool collected 150,000 and paid 151,000; delta −1,000.
- On `aedd4ac`, run `qa-load2500-e7002cd5`: uninterrupted 2,500 gifts and 50 replays; accounting passed. 329.215 seconds; median 458ms, p95 1,910ms, max 11,001ms. A 20-second CPU profile was collected during this diagnostic run, so it is not an uninstrumented benchmark. It exposed significant byte decoding and garbage collection, motivating the metadata and worker changes.
- One separate QA setup (`qa-load2500-e0737230`) hit a socket failure while the restarted service was warming up, before sending gifts. Its room was closed and its new QA accounts were retained; it is not counted as a completed load run.

## Final production result

Run `qa-load2500-b1ba1e93`, room `ROOM-QA-efe6bc7f`, on deployed `db8f90c`.
Load started 2026-10-30 06:10:44 UTC; final audit and room closure finished 06:14:27 UTC. Load elapsed **221.947 seconds** (3m 42s), uninterrupted. PM2 PID stayed 139349 throughout; final HTTPS health returned 200.

| Check | Result |
|---|---:|
| Unique successful gifts / settlements / saved request results | 2,500 each |
| Senders / gifts per sender | 5 / 500 |
| HTTP 201 responses including replay probes | 2,550 |
| Same-key replay probes | 50 passed |
| Different-payload replay under an existing key | HTTP 409 IDEMPOTENCY_CONFLICT |
| Receiver gift events | 2,500, exactly one per transaction |
| Coins spent | 250,000 |
| Lucky Coins returned | 150,000 |
| Receiver Diamonds | 25,000 |
| Pool contributions / payouts | 150,000 / 150,000 |
| Net pool balance change | 0, exactly reconciled |
| Room gift total | 250,000 |

All sender balances and totalSpent values matched the committed ledger. Each settlement's allocation summed to its gross Coins. The intentional conflicting-key request produced the sole new error-log entry during this run; there were no unexpected gift errors. The failed request did not add a gift or debit.

| Latency | Median | p95 | p99 | Maximum |
|---|---:|---:|---:|---:|
| HTTP request → response | 398ms | 733ms | 1,141ms | 2,901ms |
| HTTP request → receiver event | 394ms | 731ms | 1,138ms | 2,896ms |
| Receiver event relative to HTTP response | −3ms | −1ms | 3ms | 16ms |

A negative relative time means the receiver event arrived before the sender's HTTP response. Delivery after settlement is not the main remaining delay.

First 500 gifts: median 384ms, p95 637ms. Last 500: median 335ms, p95 571ms. No increasing backlog was observed in this run. Against the earlier `3545d70` run, p95 improved from 1,064ms to 733ms and p99 from 3,803ms to 1,141ms. Its earlier elapsed time was split by an interruption, so elapsed-time comparisons are not controlled benchmarks.

QA senders: `USR-QA-37b86518`, `USR-QA-664fbc71`, `USR-QA-6d00f8f6`, `USR-QA-9d864794`, `USR-QA-004ada98`. Receiver: `USR-QA-d55555aa`. The private room is ended and test sockets disconnected. QA balances and financial records are retained rather than reset or refunded.

## Remaining limitation

This reduces sustained-load overhead; it is **not** evidence of universal sub-250ms settlement. Shared-recipient transactions and the shared Lucky pool still require serialization to preserve the existing accounting and payout rules. The observed maximum remained 2.9 seconds. Physical-phone animation smoothness and mobile-network latency were not verified. No mobile API or event contract change is required for these backend improvements.

Detailed transaction timing and the temporary CPU profiler are disabled in the final production process. Raw run evidence is `/tmp/qa-load2500-b1ba1e93.json` on the droplet, with a local `.tmp-qa-load2500-b1ba1e93.json` copy; those files contain only QA test results and are not committed.

