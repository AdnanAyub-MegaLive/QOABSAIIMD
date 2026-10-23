# Room Wealth, Charm and Games rankings — mobile handoff

## Status

Implemented in this release. Production deployment and verification are pending.
This is an informational API. It never debits wallets, creates payouts, settles
games, awards tasks or replays historical rewards. Existing global rankings and
the legacy all-time `gift-ranking` endpoint are unchanged. Do not label the legacy
endpoint's output Daily, Weekly or Monthly.

## Endpoint and authentication

`GET /api/v1/audio-rooms/{roomId}/rankings`

Alias: `GET /api/audio-rooms/{roomId}/rankings`

Use the existing mobile Bearer session. Account/session/device checks apply.
The owner or a connected room member may read. Room bans, owner/viewer blocks,
blocked/unavailable rooms and disconnected non-owners are rejected. Rankings
exclude deleted/inactive/globally banned users and identities blocked in either
direction with the viewer. A historical room ban restricts access, but does not
by itself erase an otherwise visible user's earlier score.

Query parameters:

| Field | Values / behavior |
| --- | --- |
| `category` | `WEALTH` (default), `CHARM`, `GAMES`; case-insensitive |
| `period` | `DAILY` (default), `WEEKLY`, `MONTHLY`; case-insensitive |
| `limit` | 1–50; default 20; keep constant while paging |
| `page` | 1-based; default 1 |
| `snapshotId` | Required for page 2 onward; returned by page 1 |

One response includes all three header counters for that same period. Start with
Daily. Tapping a counter should select its category **and the same period**.
Category changes may reuse the snapshot; period/room/account changes must not.

## Scoring and coverage

**Wealth — `COINS_SPENT`:** Sum original recorded `GiftTransaction.coinValue`
for completed gifts with a settlement in this room. Normal/Lucky gifts and each
committed combo transaction count. Multi gifts have one row per receiver's share;
only those rows are summed, never the batch ledger as well. Lucky returns are not
added or netted. Self-gifts retain their recorded value. Backpack/inventory gifts
are excluded because sending them does not spend Coins; recorded backpack audit
or recovery provenance identifies them. Old data whose provenance was removed
cannot be reconstructed from current catalogue prices.

**Charm — `GIFT_COINS_RECEIVED`:** Sum each receiver's recorded share of the
same completed gifts, including backpack face value. No wallet Diamonds, Lucky
winnings, commissions or salary. Records without a recipient user mapping are
excluded, not assigned to a guessed identity. Gift periods use original
`createdAt`, inclusive start/exclusive end. Full refunds set `reversedAt` and
remove the original contribution, not create a negative score on refund day.
The current refund service does not support partial refunds; this API does not
pretend it does. A future partial-refund feature must store the attributable
remainder and extend this aggregation before enabling that workflow.

**Games — `COINS_WAGERED` (product owner confirmed):** Sum server-owned
`SharedGameEntry.amount` where status is `SETTLED`, input currency is `COINS`, room
attribution matches, and actual `settledAt` is in the period. All supported shared
games combine, with a per-game breakdown. Winnings/profit, free points, opens,
client scores and taps do not count. Cancelled/failed/refunded entries do not
count; a retry against an existing entry cannot add another contribution.
This endpoint does not implement a new game-refund workflow; status transitions
must be made by the authoritative service, not inferred from arbitrary wallet
adjustments.

The migration records settlement time on the database's first future transition
to SETTLED, in UTC. It does **not** backfill old `resolveAt`/placement timestamps.
Pre-migration settled records remain excluded. External-provider and other legacy
round records are not included because their settlement/room attribution is not
verified. `coverage.gameSources` identifies the supported source explicitly.
`coverage.gamesSince` is the migration's recording cutoff, not the first wager.

`AVAILABLE` means the declared source is available. `PARTIAL` means the selected
Games period began before recording started; show a coverage notice. An available
empty list with total `"0"` is genuine zero for supported records, not proof that
unsupported providers/legacy history had no play. Unsupported sources are marked
`UNAVAILABLE` in coverage. Entire endpoint unavailability returns an error, never
a fabricated zero.

## UTC periods and response

- Daily: current UTC midnight to next UTC midnight.
- Weekly: Monday 00:00 UTC to next Monday.
- Monthly: first calendar day to first day of next month.
- Every interval is start-inclusive, end-exclusive. Do not derive periods from
  phone timezone or substitute all-time data.

Representative response (identifiers and figures are illustrative):

```json
{
  "success": true,
  "data": {
    "roomId": "ROOM-example",
    "category": "WEALTH",
    "period": "DAILY",
    "timezone": "UTC",
    "start": "2026-10-24T00:00:00.000Z",
    "end": "2026-10-25T00:00:00.000Z",
    "nextResetAt": "2026-10-25T00:00:00.000Z",
    "generatedAt": "2026-10-24T10:00:00.000Z",
    "checkedAt": "2026-10-24T10:00:01.000Z",
    "revision": "opaque-content-hash",
    "snapshotId": "11111111-1111-4111-8111-111111111111",
    "snapshotExpiresAt": "2026-10-24T10:02:00.000Z",
    "stale": false,
    "status": "AVAILABLE",
    "total": "1000",
    "unit": "COINS_SPENT",
    "counters": {
      "WEALTH": { "category": "WEALTH", "period": "DAILY", "total": "1000", "unit": "COINS_SPENT", "status": "AVAILABLE", "totalParticipants": 1 },
      "CHARM": { "category": "CHARM", "period": "DAILY", "total": "1000", "unit": "GIFT_COINS_RECEIVED", "status": "AVAILABLE", "totalParticipants": 1 },
      "GAMES": { "category": "GAMES", "period": "DAILY", "total": "0", "unit": "COINS_WAGERED", "status": "AVAILABLE", "totalParticipants": 0 }
    },
    "coverage": {
      "gamesSince": "2026-10-23T12:00:00.000Z",
      "gameSources": ["SHARED_GAME_ENTRY"],
      "externalProviders": "UNAVAILABLE",
      "legacyGames": "EXCLUDED_MISSING_SETTLEMENT_TIME",
      "partialGiftRefunds": "NOT_SUPPORTED_BY_CURRENT_REFUND_SERVICE",
      "giftSource": "COMMITTED_GIFT_TRANSACTION_WITH_SETTLEMENT",
      "wealthExcludesInventoryGifts": true
    },
    "page": 1,
    "limit": 20,
    "totalParticipants": 1,
    "hasMore": false,
    "entries": [{
      "publicId": "USR-example", "specialId": "EXAMPLE", "name": "Example",
      "profileImage": null, "frameUrl": null, "badgeUrl": null,
      "rank": 1, "score": "1000", "unit": "COINS_SPENT", "games": []
    }],
    "viewer": { "ranked": false, "rank": null, "score": "0", "unit": "COINS_SPENT" }
  }
}
```

The `viewer` contains the same entry fields plus `ranked: true` when ranked,
even if outside the current page. Scores/totals are decimal strings: keep them
as strings or arbitrary-precision integers. Ties sort by stable internal user
identity ascending; positions are sequential (1, 2, 3), not competition ranks.
Internal IDs are not exposed. `publicId` is the current public identity;
`specialId` is the active display ID, not the profile navigation key.

Equipped frame/badge fields include their MIME type, media version and poster
metadata where available. Use versioned URLs normally; do not append timestamps
on every refresh. Games breakdown entries contain `gameId`, `name`, `score`,
`unit` and nullable `artwork` (URL/MIME/mediaVersion). No admin configuration,
probabilities, seeds, wallet balances or payout data are returned.

## Cache, refresh and paging

Snapshots are stored for up to two minutes, never beyond period end, and isolate
room, period boundaries and visibility context. All three categories share a
snapshot. Header totals sum the complete eligible dataset, not the current page.
Different viewers may correctly see different totals when blocks apply.

Database triggers invalidate the room revision atomically with committed gifts,
reversals and settled-game changes; rolled-back operations cannot invalidate or
add score. Identity/block/ban changes also invalidate; ban expiry is evaluated on
reads. Computation uses indexed current-period queries, not all-time scans, and
a database advisory lock coalesces simultaneous calculations across processes.
This lock does not lock wallets or source records. Snapshots contain only derived
scores and are periodically pruned on reads.

`revision` changes when ranking content changes, not just `generatedAt`.
HTTP responses use `no-store`; apps may keep an account/room/category/period-scoped
in-memory view. Do not reuse another account's data. Refresh on opening, foreground,
period reset and gift/settlement/reversal notifications; debounce bursts. There is
no new mandatory socket event. Poll while visible if no relevant event is available.
Animation and rotating icons remain app responsibilities.

On `SNAPSHOT_EXPIRED`, discard paginated results and fetch page 1 without the old
snapshot. Do not append new-snapshot page 2 to old-snapshot page 1. Category/period
switch responses must be matched to the currently selected identity. Mid-request
changes may return `RANKING_CHANGED`; retry with a small backoff. The server does
not silently return stale data as fresh or old-period data under a new label.

## Errors

Usual `{ success:false, error:{ code, message } }` envelope:

- 422 `VALIDATION_ERROR`: invalid category, period, page, limit or snapshot ID.
- 409 `SNAPSHOT_REQUIRED`, `SNAPSHOT_EXPIRED`, `RANKING_CHANGED`: restart/retry as above.
- 403 `JOIN_ROOM_FIRST`, `ROOM_ACCESS_DENIED`, `ROOM_UNAVAILABLE`.
- 404 `ROOM_UNAVAILABLE`: unknown room.
- 429 `RATE_LIMITED`: 120 requests/minute per authenticated user.
- 503 `RANKINGS_UNAVAILABLE`: required schema/cutoff missing; not an empty ranking.
- Existing mobile authentication/session/device errors remain unchanged.
- Unexpected server failure: `ROOM_RANKINGS_FAILED`.

## Migration, verification and deployment

Apply `20261023130000_room_rankings`, regenerate Prisma and rebuild/restart using
the normal deployment workflow. No reward replay, balance reconciliation, data
backfill or event regeneration is needed. Stop the old process during migration
and deploy: game settlement recording begins when the migration is installed.

Automated verification includes UTC boundaries, exact large amounts, ties,
pagination, viewer outside page 1, visibility/access, cache reuse/invalidation,
full reversal, multi-share/rapid-gift fixtures, inventory handling, real settlement
timestamps, duplicate transitions, cancellation/refund states and missing room or
historical settlement attribution. PostgreSQL tests create a random isolated
schema inside a rolled-back transaction and refuse remote database URLs.

Run:

```powershell
$env:RUN_ROOM_RANKING_DB_TESTS='1'
npx vitest run src/lib/room-rankings.test.js src/lib/room-rankings-db.test.js
Remove-Item Env:RUN_ROOM_RANKING_DB_TESTS
```

Before release, verify two dedicated accounts on two phones in the same room:
header/category agreement, daily/weekly/monthly switches, page 2, an off-page
viewer, a gift burst, settlement, refresh after reversal and blocked-user behavior.
Production/two-phone checks have not been performed as part of local implementation.

Local verification on 23 October 2026: **71 tests passed across seven files**
(27 new ranking tests plus gift batch, leaderboard, refund and room-access
regressions). Targeted ESLint and Prisma schema validation passed. No application
database migration or production smoke test was run; the migration itself was
executed only inside the isolated rolled-back PostgreSQL test schema.
