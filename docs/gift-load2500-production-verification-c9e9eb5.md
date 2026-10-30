# Sustained Lucky load verification — 30 October 2026

## Implementation and deployment

Production code: `c9e9eb5`, including `53f5706` and `b356fa7`. Pushed to main on both remotes, built and restarted on production. No migrations, seeds, backfills or past reward runs.

- Catalog, owned-prop, ranking-icon and multi/backpack gift metadata reads omit animation and poster bytes. Poster availability is derived from metadata.
- A poster download fetches only the poster, rather than also decoding the full animation. Original media/range responses remain supported.
- Authenticated, versioned media reads share concurrent loads and a bounded server-side LRU byte cache: 64 MiB total, 8 MiB per item, 128 entries, five-minute lifetime. Current asset metadata, active state, signatures and session/ownership checks still run before cache access. Unversioned, missing, oversized, failed and version-mismatched reads are not retained. HTTP access/cache policy is unchanged.
- Paid Lucky sends reserve the shared pool scheduling key before opening a Serializable snapshot. This avoids starting transactions that will wait for the same pool and then retry with stale snapshots. Normal/backpack sends do not reserve the pool key. The existing database pool lock remains authoritative across processes, refunds and admin changes. This does not make a single shared pool parallel or alter its odds.

Conditional debits, integer accounting, atomic settlement/ledger/recovery writes, per-sender scheduling, saved idempotency results and database conflict retries remain intact. No mobile contract changes.

173 tests passed in 15 suites covering settlement, Lucky draws, routes, retries, refunds, progression, realtime/outbox, announcements, PostgreSQL serialization, media authorization/cache, store payloads and rankings. Production build passed.

## Method

Same workload as the previous run: five fresh QA senders, 500 one-unit Lucky gifts each, concurrently, to one fresh receiver in a private/password room. One original request at a time per sender; every hundredth gift replayed twice concurrently. This is 2,500 distinct gifts plus 50 replay probes. A final different-payload replay must return HTTP 409 IDEMPOTENCY_CONFLICT.

Only newly created QA senders were funded. No existing users were funded, debited, refunded or edited by the test, and no past rewards were awarded. Rooms are ended afterwards; QA financial records remain intact.

Requests and receiver Socket.IO observations run from the droplet through public HTTPS. These are backend/load measurements, not physical-phone animation or mobile-network verification. Normal background work remains enabled; detailed timings and CPU profiling are disabled.

The final harness reads pool counters and aggregate contribution/payout ledger totals in consistent RepeatableRead snapshots. This distinguishes concurrent unrelated activity from QA activity without editing either.

## Intermediate runs

| Code | Run | Elapsed | Median | p95 | p99 | Maximum |
|---|---|---:|---:|---:|---:|---:|
| Prior db8f90c | qa-load2500-b1ba1e93 | 221.947 s | 398 ms | 733 ms | 1,141 ms | 2,901 ms |
| 53f5706 | qa-load2500-5f73cafd | 230.660 s | 402 ms | 824 ms | 1,078 ms | 2,035 ms |
| b356fa7 | qa-load2500-b93708f2 | 225.944 s | 402 ms | 816 ms | 1,104 ms | 1,900 ms |
| c9e9eb5 | qa-load2500-923edecf | 212.851 s | 378 ms | 728 ms | 1,003 ms | 1,896 ms |

All runs completed their 2,500 sends without interruption and with exactly one receiver event per gift. The first intermediate harness failed its QA-only shared-pool assertion after the sends completed. A separate read-only audit found two unrelated gifts contributing exactly 120 Coins and paying out zero. Including those records reconciled the pool exactly. No balances or records were changed to make the audit pass. Subsequent runs use the consistent global-ledger snapshot comparison above.

These are successive production observations with other traffic/background work present, not controlled benchmarks or a guaranteed latency bound.

## Final production result

Run `qa-load2500-923edecf`; room `ROOM-QA-3b44622b`.
Load started 2026-10-30 06:42:53.351 UTC; audit and room closure completed 06:46:27.808 UTC.
Elapsed **212.851 seconds (3m 33s)**, uninterrupted.

| Verification | Result |
|---|---:|
| Distinct gifts / settlements / idempotency results | 2,500 each |
| Senders / gifts per sender | 5 / 500 |
| HTTP successes including replay probes | 2,550 |
| Same-key replay comparisons | 50 passed |
| Changed-payload replay | HTTP 409 IDEMPOTENCY_CONFLICT |
| Receiver events | 2,500; zero duplicates |
| Coins spent | 250,000 |
| Lucky Coins returned | 149,500 |
| Receiver Diamonds | 25,000 |
| Pool contributions / payouts | 150,000 / 149,500 |
| Net pool change | +500, exactly reconciled |
| Other pool activity during final snapshot interval | 0 |
| Room total | 250,000 |

Every sender balance and totalSpent matched the committed ledger. Every settlement allocation summed to gross Coins. Duplicate requests neither debited again nor created another gift/event.

| Timing | Median | p95 | p99 | Maximum |
|---|---:|---:|---:|---:|
| Request to HTTP response | 378 ms | 728 ms | 1,003 ms | 1,896 ms |
| Request to receiver event | 375 ms | 722 ms | 1,000 ms | 1,895 ms |
| Receiver relative to HTTP response | -3 ms | -1 ms | 3 ms | 16 ms |

First 500: median 407 ms, p95 893 ms, maximum 1,896 ms. Last 500: median 417 ms, p95 735 ms, maximum 1,018 ms. No steadily growing backlog was observed. Negative relative delivery time means the receiver event arrived before the HTTP response.

QA senders: USR-QA-b5f1a373, USR-QA-7ea0b264, USR-QA-183011df, USR-QA-b2eb405d, USR-QA-3fc288e7. Receiver: USR-QA-1eb53c13. The room is ended and test sockets disconnected.

Final service checks: production Git HEAD c9e9eb5; PM2 PID 143165 unchanged during the run; HTTPS health 200; REALTIME_TIMINGS=false; no listener on inspector port 9229. The sole new error-log entry during this run was the intentional IDEMPOTENCY_CONFLICT probe. No unexpected gift/retry errors were logged during this run.

## Remaining limitation

The measured maximum fell from 2.901 to 1.896 seconds, but occasional roughly two-second requests remain. This is not a claim that all settlement delays are eliminated or that every request completes below 250 ms. Shared-recipient accounting and the shared pool still serialize relevant transactions. Physical-device smoothness has not been reverified.

Raw evidence is retained on the droplet at `/tmp/qa-load2500-923edecf.json`, with a local `.tmp-qa-load2500-923edecf.json` copy. Intermediate evidence is retained under the corresponding run IDs; the first intermediate pool audit is `/tmp/qa-load2500-5f73cafd-pool-audit.json`. Raw QA data is not committed.
