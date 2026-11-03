# Audio Room Random PK — Kotlin handoff

## Status
Implemented locally. Not pushed, deployed, or verified on phones. No production records, balances or rewards changed. Existing gift accounting is unchanged.

## Exact matchmaking contract
`/api/v1/audio-rooms/{publicRoomId}/pk/matchmaking`, authenticated mobile Bearer session; owner must be present in their live room.

- GET: recover current search, no body. Poll every five seconds while SEARCHING.
- POST: `{ "requestId": "new-uuid-per-search" }`. Reuse that UUID on uncertain responses.
- DELETE: `{ "queueId": "returned-queue-id", "requestId": "original-uuid" }` (JSON body).

All use `{ "success": true, "data": { "state": "SEARCHING", "queueId": "...", "revision": 0, "requestId": "...", "expiresAt": "ISO UTC", "pk": null } }`.
States: IDLE, SEARCHING, MATCHED, CANCELLED, EXPIRED. Revision is currently 0; use server GET recovery, not this optional value, for ordering. MATCHED includes full pk. If cancel loses to a match, DELETE returns MATCHED. Cancelled/expired UUIDs never restart a search. Queue-ID mismatch returns IDEMPOTENCY_CONFLICT. A different UUID while searching returns PK_SEARCH_ACTIVE: recover with GET. Entries expire after 60 seconds; GET/POST/DELETE enforce expiry. Disconnected owners, closed or ineligible rooms are excluded when matching and their searches are cancelled on inspection; no background socket notification is required for expiry.

Matching selects the oldest eligible waiting room (bounded 50-candidate pass). Both rooms must be public, free, unlocked, live and unblocked, with their active owners connected. Blocks between owners prevent matching. Rooms with a pending/live battle cannot join another battle. Queue creation/matching/cancellation and direct invites share a database transaction lock across server processes. No game or wallet locks are used.

Random matching creates PENDING: waiting owner is left/inviter; incoming owner is right/invited. Right owner ACCEPTs or REJECTs using existing PATCH /pk; left owner CANCELs (legacy END while pending still supported). ACCEPT starts exactly five minutes. Either owner may END a live battle. Repeated ACCEPT does not restart the timer. Concurrent responses serialize; terminal battles cannot be reopened. GET matchmaking returns IDLE after a matched battle ends, allowing a fresh UUID.

## Battle response and sockets
Existing scalar fields preserved: id, status, leftRoomId, rightRoomId, decimal-string leftScore/rightScore, revision, startedAt, endsAt, endedAt, winnerRoomId.
Added `leftRoom` and `rightRoom`, each `{ "roomId": "ROOM-1", "title": "Room title", "coverImageUrl": "https://..." }`. Covers use existing versioned room-cover URLs; null when absent. No private owner/internal room IDs are exposed.

GET /pk requires room membership and returns `{pk: ...}` (latest battle, including terminal result); POST and PATCH return pk directly in data. Existing account/device/session checks remain applied.

On a match both rooms receive `audio-room:pk-matchmaking` and `audio-room:pk-invited` with `{success:true,data:pk}`. State changes use `audio-room:pk-changed`; gift score event contract is unchanged. Refetch GET /pk after events. Realtime is best effort after commit; a socket failure does not turn committed success into a failed HTTP request. Recover missed events with GET. No exactly-once socket delivery claim; deduplicate by battle id/revision.

Errors use usual code/message envelope: VALIDATION_ERROR (422), ROOM_OWNER_REQUIRED / ROOM_MEMBERSHIP_REQUIRED / ROOM_BANNED (403), ROOM_UNAVAILABLE / PK_NOT_FOUND (404), PK_CONFLICT / PK_SEARCH_ACTIVE / IDEMPOTENCY_CONFLICT / PK_STATE_INVALID (409), RATE_LIMITED (429). Per-account cap: 60 PK calls/minute. Responses private,no-store.

## Deployment and verification
Apply additive migration `20261103200000_audio_pk_search`, run prisma generate, rebuild and restart. Enable the Kotlin Random PK flag only after deployment verification. This migration creates only queue storage; no backfill or payouts.

Local tests cover duplicate search, recovery, cancel/match race, cancel replay, concurrent join/direct invite, foreign owner, blocked pair, disconnected owner, expiry, accept ownership/idempotency, exact large scores and public room metadata.

Still required after deployment on dedicated QA rooms: two owners queue, receive invite, accept, gift/score update, five-minute end; cancel before and during a match; restart/reconnect recovery; room switch/disconnect; third account rejection; title/cover display. No production or device success is asserted here.
