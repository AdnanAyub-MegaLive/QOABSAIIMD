# Global hourly gift-sending leaderboard — app handoff

## Release status

- Implementation: local backend implementation and migration; see test results below.
- Deployment: not pushed/deployed by this task; no application database migration applied.
- Real devices: not verified. Two-phone production checks remain a release step.
- Existing room Daily/Weekly/Monthly Wealth/Charm/Games endpoints are unchanged.
- Informational only. This endpoint does not send gifts, debit balances, settle
  games, award rewards, create payouts or replay historical rewards.

## API

`GET /api/v1/rankings/hourly-gifts`

Alias: `GET /api/rankings/hourly-gifts`

Send the existing mobile `Authorization: Bearer <session>` header. Normal session,
account and registered-device checks apply. No query parameters or request body
are accepted; clients cannot choose a sender, score, contribution or hour. The
server returns both hours and all header/list/viewer data in one response.

## Time and countdown

Timezone is **UTC**, not GMT+3 or the phone's timezone. Periods are fixed clock
hours: `[17:00:00, 18:00:00)`. The previous period is `[16:00:00, 17:00:00)`.
At 18:00, both sections advance together. Week/month/year rollover is supported.

Use `nextResetAt - serverTime` at response receipt, then subtract elapsed monotonic
time for the countdown. Do not calculate the hour from the phone wall clock.
On reaching zero, fetch again; do not relabel old results as the new hour.
`HOUR_CHANGED` means the hour crossed during rendering: retry the GET.

## Scoring

- Global application sending, without a room filter. Supported authoritative
  surfaces: audio rooms, video live, direct chat, group chat, and direct gifts
  that write the same gift/settlement records. Missing room attribution does not
  exclude a global gift.
- Sum original `GiftTransaction.coinValue`, never current catalogue prices.
  A committed `GiftSettlement` and `GiftRecoverySnapshot.data.source = COINS`
  are required to establish successful paid sending.
- Normal and Lucky gifts and each successful combo transaction count. Lucky
  winnings do not add to or subtract from score. Self-gifts keep recorded value.
- Multi-recipient sends write one transaction per attributed receiver share.
  Sum those rows only; do not also sum the batch's wallet debit. Their sum equals
  the charged batch amount. Retry/idempotency remains the existing send service's
  responsibility; replaying a receipt does not insert another contribution.
- Pending, failed and rolled-back operations have no eligible committed records.
  Fully reversed gifts (`reversedAt` set) are excluded. Refunds correct the gift's
  original `createdAt` hour, not a negative amount in the refund hour.
- Inventory/backpack and free gifts are excluded, including known historical
  backpack audit provenance. Zero-value gifts cannot enter the leaderboard.
- No wallet, gift-send, Lucky payout or refund calculations were changed.

### Coverage and unavailable states

Old records without a committed settlement are excluded: they are not evidence
of completed sending. A positive, settled record without a verified funding
source cannot safely be classified as paid versus free. If such records exist
in either requested hour, **that hour** returns `coverageStatus: UNAVAILABLE`,
null totals/participant count and no entries. For an unavailable current hour,
viewer/header `sentCoins`, `rank`, `ranked`, `inTop50` and
`additionalCoinsToTop50` are null. Do not convert these to zero, false or `50+`.

This conservative coverage check is global, even if an unverified sender would
be hidden to a particular viewer. No identities, counts or transaction details
of the unverified records are exposed. No history is silently backfilled.
Existing modern gift operations already record the required funding provenance.

The current refund service supports full reversals only, not partial refunds.
If partial refunds are introduced, their authoritative remaining contribution
must be added before claiming support. External/legacy gift systems that do not
write these records are unsupported; their activity is not guessed.

## Visibility, order and entry threshold

Active, non-deleted, non-globally-banned users are ranked. Blocks in either
direction with the viewer are filtered **before** sorting, counting, taking Top
50/Top 3 and calculating thresholds. Therefore visible global positions can
differ for accounts with different blocks; header/list/viewer always agree for
one response. Visibility is checked again before returning, including ban expiry.

Sort by exact Coins descending, then stable internal user identity ascending.
Ties receive sequential ranks (1, 2, 3), not shared ranks. Internal IDs are never
returned. Display Special IDs/public-ID changes do not change the tie break.

`additionalCoinsToTop50` is **additional required spending**, not sent Coins:

- Already Top 50: `"0"`.
- Unranked and fewer than 50 participants: `"1"` (smallest positive Coin score).
- Otherwise compare against the 50th sender: equal that score if the viewer wins
  the stable tie break; otherwise exceed it by one. Subtract the viewer's current
  score. A nonqualifying viewer always needs at least one additional Coin.
- Example: viewer sent 700; 50th score is 1,000. Need `"300"` if the viewer wins
  the tie break, otherwise `"301"`. There is no 500-Coin minimum.
- These are exact thresholds for the returned snapshot, not a guaranteed future
  place while other users keep sending.

Amounts are decimal **strings**. Preserve integer precision; never use JavaScript
floating-point arithmetic for Coins. Rank and participant counts are integers.
Use `publicId` for profile navigation and nullable `specialId` for display.

## Fields and representative response

`header` duplicates the current viewer's score/rank/threshold using the same
`hourId` and `revision`. It is suitable for the rotating second header counter.
`viewer` always contains public identity and the same position data, including
when outside Top 50. A known zero-sending viewer has `ranked: false`, `rank: null`,
`sentCoins: "0"`; this differs from unavailable data with null values.

Example with one current sender, no previous-hour sender and a zero-sending viewer:

```json
{
  "success": true,
  "data": {
    "scope": "GLOBAL_GIFT_SENDING",
    "timezone": "UTC",
    "hourId": "2026-10-23T17:00:00.000Z",
    "nextResetAt": "2026-10-23T18:00:00.000Z",
    "serverTime": "2026-10-23T17:20:01.000Z",
    "generatedAt": "2026-10-23T17:20:00.000Z",
    "revision": "opaque-content-hash",
    "status": "AVAILABLE",
    "stale": false,
    "refreshAfterMs": 2000,
    "cacheScope": "ACCOUNT_AND_VISIBILITY",
    "visibilityPolicy": "FILTER_THEN_RANK",
    "unit": "COINS_SPENT",
    "currentHour": {
      "start": "2026-10-23T17:00:00.000Z",
      "end": "2026-10-23T18:00:00.000Z",
      "coverageStatus": "AVAILABLE",
      "totalParticipants": 1,
      "totalSentCoins": "1000",
      "entries": [{
        "publicId": "USR-example", "specialId": "EXAMPLE", "name": "Example",
        "profileImage": null, "frameUrl": null, "badgeUrl": null,
        "rank": 1, "score": "1000", "unit": "COINS_SPENT"
      }]
    },
    "previousHour": {
      "start": "2026-10-23T16:00:00.000Z",
      "end": "2026-10-23T17:00:00.000Z",
      "coverageStatus": "AVAILABLE", "totalParticipants": 0, "entries": []
    },
    "viewer": {
      "publicId": "USR-viewer", "specialId": null, "name": "Viewer",
      "profileImage": null, "frameUrl": null, "badgeUrl": null,
      "ranked": false, "rank": null, "sentCoins": "0", "unit": "COINS_SPENT",
      "inTop50": false, "additionalCoinsToTop50": "1"
    },
    "header": {
      "hourId": "2026-10-23T17:00:00.000Z", "revision": "opaque-content-hash",
      "ranked": false, "rank": null, "sentCoins": "0", "unit": "COINS_SPENT",
      "inTop50": false, "additionalCoinsToTop50": "1"
    },
    "coverage": {
      "supportedSurfaces": ["AUDIO_ROOM", "VIDEO_LIVE", "DIRECT_CHAT", "GROUP_CHAT", "DIRECT_GIFT"],
      "source": "COMMITTED_GIFT_TRANSACTION_WITH_SETTLEMENT",
      "inventoryAndFreeGifts": "EXCLUDED",
      "legacyRecordsWithoutSettlement": "EXCLUDED",
      "legacyMissingFundingProvenance": "EXCLUDED_UNVERIFIED_SPENDING",
      "partialRefunds": "NOT_SUPPORTED_BY_CURRENT_REFUND_SERVICE",
      "previousHourPolicy": "RECALCULATED_WITH_REVERSALS_AND_CURRENT_VISIBILITY"
    }
  }
}
```

Each previous-hour entry also has nullable `liveRoom: { roomId, title }`.
This is current presence, not the gift's original room. Only a currently connected
participant's LIVE room accessible to this viewer is returned. Owner blocks,
room bans, disabled joining, password and paid-admission restrictions apply.
An existing membership can prove password admission. At most ten recent room
memberships per podium user are checked. Null means no verified accessible live
room, not necessarily that the user is offline. The normal join API still makes
the final authorization decision when tapped.

Equipped frame/badge metadata includes MIME types, media versions and posters
where available, using existing versioned public display/CDN URLs. No global
auto-equipped artwork is added. Cache images normally; do not append timestamps
on each data refresh.

## Update strategy and previous-hour corrections

The previous hour is **recalculated**, not frozen as an immutable winner list.
Later reversals and current identity/visibility changes can change its Top 3.
There are no rewards or final payout results attached to it.

An indexed query reads only the current and previous hour. A server-only raw
score cache is shared across readers; viewer-visible responses are freshly
filtered for each account and are never globally cached. A database advisory lock
coalesces concurrent calculations across server processes. Committed changes to
gift records, settlements and funding provenance invalidate separate global
revision shards; existing room revisions/queries are unchanged.

Invalidation does not recompute globally for every combo tap. A two-second
coalescing interval reuses a recently generated snapshot with `stale: true`.
After it elapses, the next request rebuilds. An unchanged cache is rechecked after
30 seconds; it never survives the hour boundary. No stale cache is served as an
error fallback beyond its expiry. DB/service errors return errors, not zero data.

Overall status is `AVAILABLE`, `STALE`, `PARTIAL` (only one hour available) or
`UNAVAILABLE` (neither hour verified). Also inspect each hour's `coverageStatus`
and `stale` independently: partial coverage can coexist with stale data.
`generatedAt` is the scores' generation time; `serverTime` is response timing.
`revision` excludes clocks and includes visible ranking/identity/artwork-version
and live-room changes. Do not use it as a substitute for the countdown clock.

Refresh on open, foreground and UTC reset. While visible, poll approximately
every 2–5 seconds, respecting `refreshAfterMs`. Existing successful-gift or
leaderboard notifications can trigger a debounced refresh; no new socket event
is required. Retry `HOUR_CHANGED`/`RANKING_CHANGED` with a short backoff. Clear
in-memory state on logout/account switch. Match responses by account and hour.

Rate limit: 60 GET requests/minute/user through the existing server limiter.
HTTP responses use `Cache-Control: no-store`. Do not persist ranking responses
across accounts. The mobile **Send gift** button only opens the gift picker;
neither this GET nor button navigation should automatically submit a gift.

## Errors and deployment

Normal `{ success:false, error:{ code, message } }` envelope:

- 422 `VALIDATION_ERROR`: supplied query parameters (not supported).
- 403 `FORBIDDEN`: viewer unavailable/banned; existing auth/device errors also apply.
- 409 `HOUR_CHANGED` or `RANKING_CHANGED`: retry the whole GET.
- 429 `RATE_LIMITED`: slow down refreshes.
- 503 `HOURLY_RANKINGS_UNAVAILABLE`: migration/schema missing.
- Unexpected failure: `HOURLY_RANKINGS_FAILED`. Never render the error as zero.

Migration: `20261023140000_hourly_gift_rankings` (after the room ranking migration).
Adds a global timestamp index, derived-cache table and isolated invalidation
triggers. No balance/history updates, backfill, reward replay, seeds, catalogue
changes, event regeneration or new environment settings are required. Apply
migrations, generate Prisma and rebuild/restart using the normal maintenance
deployment workflow; index creation may require a maintenance window.

## Verification

Local tests cover fixed UTC boundaries (also with non-UTC database session time),
cross-room/null-room sending, normal/Lucky/combo and multi-share records, duplicate
inserts, rollback, reversal of the original hour, funding coverage, big integers,
Top-50 ties/thresholds, empty and off-page viewer states, visibility changes,
accessible live rooms, coalescing, concurrent requests and hour rollover.

Opt-in PostgreSQL tests create a random schema inside a single rolled-back
transaction and refuse remote database URLs. No existing application records or
balances are changed:

```powershell
$env:RUN_HOURLY_RANKING_DB_TESTS='1'
npx vitest run src/lib/hourly-gift-rankings.test.js src/lib/hourly-gift-rankings-db.test.js src/lib/hourly-gift-rankings-route.test.js
Remove-Item Env:RUN_HOURLY_RANKING_DB_TESTS
```

After deployment, use dedicated test accounts on two phones to check current
header/list/viewer agreement, gifts from two different rooms, an hour reset,
previous-hour correction after an approved test reversal, Top-50 thresholds,
blocked identities and room navigation. Service-level concurrency tests do not
constitute real-device verification. Production/device verification is pending.

Local verification on 23 October 2026: **109 tests passed across ten files**,
including 38 new hourly tests and the 71 room/gift/access regression tests.
Targeted ESLint, Prisma schema validation and client generation passed. Database
tests ran only in isolated rolled-back schemas; no application migration,
existing balance adjustment, reward operation or production test was performed.
