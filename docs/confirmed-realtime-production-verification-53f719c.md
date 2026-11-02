# Production verification: 53f719c

Verified 29 October 2026, approximately 17:30–17:41 UTC, against `https://portal.megachat.live`.

## Deployment

- Checkout: `53f719c`; PM2 `megalive-portal` online, running the expected `server.js` with Node 24.21.0.
- Migration `20261030010000_confirmed_realtime` finished at 17:28:33.419 UTC, not rolled back.
- All four new tables and seven trigger registrations present.
- Numeric event and room-delta queues were empty at the final check.
- No code, configuration, announcement thresholds or migrations were changed during verification.

## Dedicated QA scope

Four new accounts created solely for this test:

| Account | Purpose |
|---|---|
| USR-QA-9e174364 | Room owner / recipient |
| USR-QA-c5bdff30 | Sender |
| USR-QA-49030cdd | Second sender / recipient |
| USR-QA-80a461a4 | Outside-room observer |

The two new senders were each funded with 30,000 QA Coins and corresponding adjustment ledger entries. Existing users were not funded, charged, refunded or edited. No past rewards were awarded. Existing live activity continued independently of this test.

Room `ROOM-QA-2b543f7a` was password-protected for the tests. With explicit user approval, it was briefly public for one 10,000-Coin QA announcement. It is now ENDED and password-protected again. QA transactions and audit records remain available; no history was deleted.

## Results

| Check | Result |
|---|---|
| Empty room snapshot | HTTP 200, zero total and empty recipients |
| Outside-room access | HTTP 403 |
| Wallet privacy | Only the affected accounts received their revisioned wallet events |
| Wallet rollback | Held an update uncommitted for 400ms, then rolled back; no event or revision change |
| Single/multiple senders | Confirmed wallet events and room totals received |
| Multi-recipient request | Both recipient shares included once |
| Lucky gift | Send succeeded; sampled draw returned zero Coins; gift value included once |
| Idempotent retry | Same transaction, no second charge or wallet revision |
| Absolute wallet snapshots | Socket balances/revisions matched authenticated wallet GET responses |
| Stale read detection | Older snapshot revision remained distinguishable from later socket state |
| Reconnect | Fresh wallet and room snapshots recovered the latest state; second connection retained room membership |
| Refunds | Two gifts created during this QA run refunded through the existing guarded service; wallet events and room total correction verified |
| Room totals | Final 22,700 Coins equalled eligible committed QA gift records; changed-recipient totals matched recorded shares |
| Duplicate numeric delivery | No duplicate IDs observed on any individual test connection during the completed follow-up |
| Numeric outbox | All 99 QA numeric events marked delivered; no pending deltas |
| Notifications | Private notification arrived; repeated source key left one notification row |
| Private announcement | Qualified big gift recorded but not broadcast from the password room |
| Public big-gift announcement | One approved 10,000-Coin gift reached sender, owner and outside-room QA observer; correct amount, actor and room, unexpired |
| Announcement retry | Same request caused no second charge or announcement; exactly one announcement row and one receipt per QA connection |
| Lucky-return announcement | Outside-room QA observer passively received an unexpired live Lucky-return announcement; no existing user's transaction was initiated or changed by the test |

The original reconnect test attempted gifting to a fully disconnected recipient; it was correctly rejected with `ROOM_PARTICIPANT_REQUIRED` and left no committed GiftRequest. The corrected test kept a second connection present. A separate harness assertion initially expected a historical socket event on a newly reconnected connection; recovery correctly uses HTTP snapshots instead. The corrected recovery/refund checks passed.

## Timings and remaining limitations

Measurements used authenticated Socket.IO clients on the server host through the public HTTPS/WSS endpoints, not physical phones.

Ten sequential ordinary gifts:

- HTTP response: 100–248ms.
- Request start → wallet socket receipt: 111–260ms.
- Request start → room-total socket receipt: 123–275ms.
- HTTP response → wallet socket receipt: 6–17ms.
- HTTP response → room-total socket receipt: 17–58ms.

The approved public announcement arrived 52–56ms after the HTTP response (255–259ms from request start). Three QA connections received it once each.

These are **not** commit-to-emission measurements: HTTP completion, database commit, socket emission and phone rendering are different boundaries. No claim is made that the proposed p95 commit-to-emission target or phone render latency has been met.

Concurrent sends still showed HTTP times up to 1,858ms. The new numeric delivery works after confirmation, but gift settlement/queue latency under contention remains a separate performance issue. No settlement or retry rules were changed as part of verification.

Not exercised here: a newly settled qualifying game-win announcement, real-device UI application, sustained high-volume load, or forcibly interrupting production database/socket infrastructure. Local failure-path tests remain the evidence for delivery-marker failure and listener recovery under injected faults.

## Evidence

Server-side QA reports:

- `/tmp/qa-rt53-d4277d7e.json` — initial tests and membership rejection.
- `/tmp/qa-rt53-d4277d7e-followup.json` — ten-send timing sample and first recovery harness assertion.
- `/tmp/qa-rt53-d4277d7e-final.json` — corrected recovery, refunds, duplicate checks and passive announcement observation.
- `/tmp/qa-rt53-d4277d7e-announcement.json` — approved public banner, idempotency and unchanged-policy checks.

The app contract remains in `docs/confirmed-realtime-app-handoff.md`.
