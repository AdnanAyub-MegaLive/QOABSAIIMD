# Game catalogue live updates (142)

Backend implemented locally; deployment and physical-phone verification pending.

Authenticated apps listen on the existing Socket.IO connection for
`games:catalog-updated`:

```json
{"success":true,"data":{"revision":"123","gameIds":["pizza"],"changedAt":"2026-10-27T12:00:00.000Z"}}
```

Revision is a database sequence value encoded as a decimal string. Gaps are
allowed. Compare with BigInt, not floating point. Ignore older notifications.
It is an invalidation hint, not a settings snapshot; no rules, odds, URLs or
credentials are included. Broadcast happens after successful save/archive.
Failed notification never changes a committed mutation into a failed response.
There is no durable replay; reconnect and foreground must always refetch.

Refetch GET /api/v1/games and refresh the active game's player/shared-state
through the existing authenticated flow. Coalesce bursts, but ensure an event
arriving during an in-flight fetch causes another fetch. Do not auto-place bets
or restart an active round. Existing server round settings remain authoritative.
The native app must forward invalidation to an open game WebView or otherwise
trigger its refresh; backend emission alone does not remove its polling delay.

Built-in iconVersion and URL v parameter use SHA-256 of bundled bytes, generated
by predev/prebuild. Uploaded icons retain their media version. Existing image
cache headers need not change. Building/deploying bundled files is not an admin
database mutation: clients pick these versions up on their next catalogue read.

Apply migration 20261027010000_game_catalog_revision before restart. No backfill,
balance edits, payouts or round changes. Test on two phones: pause/resume a QA
game, edit another game's settings, change its icon/link and archive a QA link.
Observe the event and refreshed UI timestamps; under-one-second end-to-end
latency is an acceptance target, not yet measured. Keep polling as fallback.
