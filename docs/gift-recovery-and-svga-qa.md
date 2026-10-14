# Gift recovery contract and production SVGA QA

## Deployment boundary

SVGA fixes are deployed through `a1e7344`. The gift outcome/replay endpoints and identifier additions described below are local changes, not yet deployed. No schema migration is required.

## Production verification (2026-10-15)

Dedicated accounts: `USR-696194` and `USR-372931`. Both were created for QA with zero Coins and Diamonds. No existing user's equipment, balance, profile or level was changed.

- Granted an existing SVGA badge to the first QA account for 24 hours and equipped it through the real mobile API: HTTP 200.
- Own profile and public profile read by the second QA account: HTTP 200, badge URL present, `badgeMimeType: application/svga`.
- Both accounts joined a password-protected test room through authenticated Socket.IO.
- First account took a seat; the second account received SVGA metadata in the seat update.
- First account sent a test chat message; the second account received SVGA badge metadata on its sender.
- A temporary GAME rule was created and removed inside ONE transaction, with a one-point award only to the QA account. Other transactions never saw that rule. The committed outbox event reached the QA account over its authenticated socket with level 1 and a badge URL returning HTTP 200 from `media.megachat.live`.
- Previous global GAME configuration remains absent. The QA award/outbox records remain as test evidence; no financial ledger or wallet was changed by this test.
- Test room `ROOM-QA-2654ceff-5d99-4e17-a776-8042b4b45185` was ended; sockets disconnected. QA accounts remain for follow-up testing. The script is intentionally guarded to these account IDs.

This verifies backend/network payload delivery, NOT animation playback on a phone. Production has no equipped SVGA Profile Dress/User Tag/Profile BG fixtures; those categories were verified with isolated serializer tests rather than modifying existing assets.

## Authoritative gifting behavior

| Flow | Endpoint | Recipients per request | Atomicity |
|---|---|---:|---|
| Paid single, including Lucky | POST /api/gifts/send (v1 alias available) | 1 | One transaction |
| Lucky alias | POST /api/v1/gifts/lucky/send | 1 | Same paid handler; catalog tier determines reward behavior |
| Backpack | POST /api/v1/gifts/backpack/send | 1 | One inventory/settlement transaction |
| Normal multi | POST /api/v1/gifts/send-multi | 1–12 unique recipients | Entire request succeeds or rolls back |

Quantity is 1–999 per recipient. Multi supports CLASSIC, PREMIUM and VIP tiers, not Lucky/blind boxes. There is no atomic Lucky/backpack multi-send. Product approved per-recipient sends with recoverable results; a batch is a UI grouping, never a transaction or idempotency key.

For room sends, sender and recipient must be connected to the LIVE room. No seat/owner privilege is required: owner, seated users and listeners use the same eligibility checks. Self-gifting is allowed and uses the same debit/inventory consumption and settlement rules; eligible self-gift XP is allowed. Recipients must be active, not deleted; HOST recipients require an agency. Membership/role consistency is rechecked in the transaction. Paid sends conditionally debit Coins, backpack sends conditionally consume inventory; recipients receive Diamonds according to configured policy. A lack of balance/inventory must never be simulated as success.

Important distinction: a Lucky-tier item sent from the backpack currently follows BACKPACK settlement/XP and does NOT run paid Lucky reward logic. Do not advertise a Lucky win for a backpack item. This is a remaining product/implementation distinction, not confirmed parity.

## Identifiers and retry handling

Persist a unique `Idempotency-Key` BEFORE each recipient send. Reuse it with the exact same payload on timeout/retry; a different payload returns IDEMPOTENCY_CONFLICT. Use a new key for each intentional recipient operation. Normal multi may use its required body requestId as the key fallback. Single sends without a client key cannot reliably recover an unknown outcome; avoid them.

New responses/events include requestId (the operation key), transactionIds, recipientIds, giftTier and catalogCategory. Existing transactionId/recipientId and legacy giftCategory remain compatible. Normal multi adds `recipients: [{ recipientId, transactionId }]`; never infer this mapping from independently ordered arrays. giftBatchId is optional (maximum 64 characters), shared across one UI send action, and does not suppress any financial operation. Gift artwork retains media/poster URLs, MIME types and separate versions. Older stored results/events are not rewritten.

### Unknown send outcome

GET `/api/v1/gifts/outcome?requestId=<original-idempotency-key>` with Bearer authentication, rate limit 60/minute/user.

Returns `{ success:true, data:{ requestId, status:"COMMITTED"|"UNKNOWN", result, committedAt } }`. Result preserves the stored response shape: paid handler results include success/data; backpack/multi results are their data object. Only the authenticated sender's record can be retrieved.

UNKNOWN means no committed result is visible yet, not that the send failed. Retry the ORIGINAL request with the SAME key; never generate a new key after a timeout. COMMITTED means use the stored transaction identifiers and result; do not send again. Outcome lookup does not change balances, inventory or event delivery state.

### Reconnect event recovery

After successfully rejoining the room, GET `/api/v1/audio-rooms/{roomId}/gift-events?since=<ISO timestamp>&afterId=<cursor>`.

Returns `events: [{ event, createdAt, payload }]`, nextCursor, hasMore, replayWindowSeconds (600). Page size is 50; keep the same since timestamp while paginating. Events are ordered by createdAt then ID. Both gift:received and gift:received-multi are included from the committed outbox, irrespective of whether the worker already emitted them. payload.data.eventId matches the socket event and recovered is true.

Requires current authenticated room presence, LIVE/unblocked room, and no active room ban. Replay is limited to the last ten minutes/current room session. Expired cursors return 409 GIFT_REPLAY_CURSOR_EXPIRED; restart within the window or use existing paginated room gift history for older financial records. Recovery is not a guarantee of replaying every historical animation. Prefer silently reconciling recovered events rather than playing a burst of old effects. Deduplicate by eventId and transaction identifiers; process live events concurrently to close reconnect races.

## Remaining verification

- New recovery contracts have unit/lint/build checks but are not deployed or production-tested.
- Production has no active Lucky gift (only two CLASSIC gifts were found); Lucky wins and retry recovery still require dedicated financial fixtures.
- No Coins were issued to QA accounts; paid/backpack financial sends, multi-send rollback and real concurrent retries have NOT been tested against production.
- Verify VIP-specific eligibility policy separately; existing handlers do not uniformly enforce a minimum VIP level at send time. This change does not invent new eligibility rules or weaken existing checks.
- Android/iOS must verify actual SVGA playback, optional posters, layout, cache reuse, replacement invalidation and immediate badge refresh after level events.
