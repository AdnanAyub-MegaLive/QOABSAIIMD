# Global announcements — app handoff

## Status

Implemented with automated verification. Production migration and deployment remain required. No production
announcements, user/balance edits, reward grants or historical backfills were made.
Mobile rendering and two-phone verification remain app/release work.

## Admin controls

Portal sidebar → **Global Announcements**, also accessible at
`/platform-rules/global-announcements`.
Read: `rules.view`; edit: `rules.manage`. Existing Platform Admin permission rules apply.

`GET /api/admin/global-announcements` and same-origin `PUT` (portal session only).
PUT body:

```json
{
  "revision": 0,
  "rules": {
    "BIG_GIFT": { "enabled": true, "minimumCoins": "100000" },
    "GAME_WIN": { "enabled": true, "minimumCoins": "100000" },
    "LUCKY_RETURN": { "enabled": true, "minimumCoins": "100000" }
  },
  "cooldownSeconds": 10,
  "lifetimeSeconds": 60
}
```

These values are examples, not enabled production policy. Defaults are all OFF,
100000 Coins each, cooldown 10 seconds, lifetime 60 seconds. Thresholds are positive
integer strings up to 18 digits. Cooldown: 1–300 seconds, lifetime: 15–120 seconds.
Use the revision returned by GET for edits. Stale edits return 409 SETTINGS_CHANGED.
401/403 protect access, 422 VALIDATION_ERROR rejects invalid configuration.
Saving resets the activation cutoff to that save time for all three types, cancels
undelivered older-revision messages and affects only subsequently confirmed activity.
This policy is independent of the Lucky payout policy's existing bigWin flag.

## Exact qualification rules

- BIG_GIFT: one committed, paid gift transaction's recorded coinValue. A
  multi-recipient request has one attributed transaction per recipient, not an
  extra batch total. Taps/combo totals are NOT summed. Free/backpack gifts excluded.
- LUCKY_RETURN: actual luckyCoins recorded in that gift's recovery snapshot.
  This is **returned Coins, not profit**. Exact multiplier is
  `multiplierNumerator / multiplierDenominator` = returned Coins / that gift's
  spent Coins. Use decimal arithmetic; never infer this from current prices.
- GAME_WIN: SUM(settled payouts) − SUM(wagers) for the player's whole shared round
  (day/game, room, slot, player). Wait for all Coin entries to settle and their
  resolve time to pass, including early Rocket cash-outs. Positive net profit must
  meet the threshold. Pending/cancelled/refunded groups do not qualify.
  Supported: SharedGameEntry COINS rounds. PLAY_POINTS, legacy GameRound-only
  records and external providers without this authoritative settlement are excluded.
- Threshold comparison is inclusive. Integer precision is preserved.
- A qualifying event starts a per-actor, per-type cooldown. Further matches in
  that interval are suppressed (not delayed or combined). A gift can independently
  qualify as both BIG_GIFT and LUCKY_RETURN.

## Socket contract

Listen on the app's existing authenticated Socket.IO connection:
**`global:announcement`**. There is no client publish/claim endpoint and no wallet action.

```json
{
  "success": true,
  "data": {
    "announcementId": "BIG_GIFT:opaque-source-key",
    "type": "BIG_GIFT",
    "amount": "100000",
    "unit": "COINS",
    "actor": { "publicId": "USR-2030141", "name": "QA Sender" },
    "roomId": "ROOM-123",
    "details": {
      "giftName": "Rose", "quantity": 10, "spentCoins": "100000"
    },
    "policyRevision": 1,
    "occurredAt": "2026-10-29T12:00:00.000Z",
    "expiresAt": "2026-10-29T12:01:00.000Z",
    "serverTime": "2026-10-29T12:00:01.000Z"
  }
}
```

`amount` means spent Coins / net-profit Coins / returned Coins according to type.
GAME_WIN details: `gameId`, `gameName`, `wagerCoins`, `payoutCoins`, `netProfitCoins`.
LUCKY_RETURN details: `giftName`, `quantity`, `spentCoins`, `returnedCoins`,
`multiplierNumerator`, `multiplierDenominator`.
All Coin values and multiplier numerator/denominator are decimal integer strings.
Names are plain text, never HTML. IDs are opaque; don't parse them. Artwork is not
included in this initial banner contract; use app category icons, not invented URLs.

## Privacy

Only public, live, unblocked, unpassworded, non-paid audio rooms qualify. Private
messages, outside-room gifting and live-video gifting are excluded. No recipients,
private transaction details, wallet balances or internal user IDs are broadcast.
The backend checks actor/owner status, account bans, both-direction blocks,
room bans and recipient socket session versions before sending. Disabled/changed
policy, removed users and reversed gifts are suppressed at delivery time.
A banner is not admission permission: tapping must use normal room join checks.
Already-seen banners cannot be undone if a gift is reversed later; they are not
financial receipts or an authoritative transaction history.

## Non-blocking behavior and deduplication

A separate 1-second worker reads recent committed source records; no gift/settlement
handler awaits it or acquires its locks. Source reads have bounded time windows and
indexes; collection caps at 100 candidates per tick, delivery at 10 banners per tick.
A worker-only advisory lock serializes collection, unique IDs prevent duplicate
records, delivery leases coordinate workers, and same-process sent IDs avoid
re-emission after a marker-write failure. No financial records are modified.

The transport is **at least once while fresh**, not exactly once. A process crash
between emit and delivery acknowledgement can repeat the same ID. The app MUST
deduplicate `announcementId` through expiry (across reconnects within that lifetime).
Socket delivery is best-effort for currently connected clients, not guaranteed offline
delivery. Expired activity is intentionally dropped rather than replayed in bursts;
outages/backlogs longer than the lifetime can lose banners without losing gifts.

App rules:
1. One independent banner queue, max 3–5 entries; drop oldest expired/overflow items.
2. Deduplicate by announcementId, not sender/gift name or request ID.
3. Estimate remaining lifetime from expiresAt − serverTime using a monotonic local
   elapsed timer. Do not extend expiry on duplicates or reconnect.
4. Use short non-modal display (e.g. 3 seconds), clipped to remaining lifetime.
5. Never disable Send, combo taps, gift picker, games or audio during a banner.
6. Render names safely as text. Unknown types may be ignored.
7. On logout clear pending banners. No historical replay API is provided.

## Deployment and verification

Apply `20261029010000_global_announcements`, generate Prisma client, rebuild and
restart the custom server. No backfill, wallet operation or reward settlement command
is required. Enable desired types/thresholds in the portal after deployment.

Local verification uses mocked-worker tests plus an isolated **in-memory PGlite**
PostgreSQL test: executes the migration and actual candidate SQL, checks 64-bit
Coin precision, multi-entry round profit, pending settlement, free gifts, reversals,
private gifts, activation windows and receipt deduplication. No live DB is used.

Before mobile rollout use dedicated QA accounts:
- Below/exactly-at thresholds, all three types, multi-recipient sends and combos.
- Retried sends produce the same announcement IDs, no duplicate UI banners.
- Pending game round does not announce; full round net profit does.
- Pause a type; pending old-policy messages disappear.
- Verify blocked/banned viewers and private rooms receive no announcement.
- Restart worker during delivery, simulate disconnect, and confirm app dedup/expiry.
- On two phones send gifts concurrently while banners appear: send controls and
  audio stay responsive. Measure latency/load; no sub-second guarantee is claimed.
