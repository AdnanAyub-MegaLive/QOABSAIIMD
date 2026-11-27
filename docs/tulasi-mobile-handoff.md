# Tulasi provider games — mobile handoff

Tulasi games run as H5 pages inside live audio rooms. Bets and wins change the user's real coin balance through server-to-server callbacks; the app never sends coin amounts.

## 1. List games
`GET /api/v1/tulasi/games` (Bearer mobile token)

```json
{ "success": true, "data": { "games": [
  { "gameId": 58, "name": "Teen Patti Gold", "identification": "kingdoms", "image": "https://…", "banner": "https://…", "engine": "tulasi", "designWidth": 750, "designHeight": 750 }
] } }
```
Only games an admin enabled under **Room Games → Tulasi provider games** are returned.

## 2. Launch a game
`POST /api/v1/tulasi/launch` (Bearer mobile token)

```json
{ "gameId": 58, "roomId": "<audio room id>", "lang": "en" }
```
The user must currently be in that room. Response:

```json
{ "success": true, "data": { "gameId": 58, "name": "…", "url": "https://gamesp.tulasigame.com/kingdoms/?merchant=…&token=…", "expiresAt": "…", "designWidth": 750, "designHeight": 750 } }
```
Errors: `GAME_UNAVAILABLE` (404/503), `ROOM_*` (403), `INVALID_REQUEST` (422), plus the usual session errors. Request a new URL every time the game opens; the token inside lasts at most 2 hours.

## 3. Open it
- Use the TulasiGame SDK (Android AAR / iOS XCFramework / Flutter plugin, downloadable from the Tulasi admin panel, step 4) with `openGame(url, usePackage = true)`, or a WebView. Keep the full URL unchanged.
- Show it half-screen over the room. Height = screen width × designHeight / designWidth.
- Handle `tulasigame://exit` (close the game) and `tulasigame://recharge` (open our coin recharge page). With the SDK these arrive as `closed` and `recharge` events.
- After the game closes, refresh the wallet balance.

## Rankings and win messages

Tulasi activity is included in the existing room Games ranking and overall Game
Ranking. Provider game IDs in ranking breakdowns are namespaced as `tulasi:<id>`;
the catalog supplies their names and images. No mobile release is required.

Rankings (and the weekly game reward pool) count completed Tulasi coin debits at
the server ledger time, including losing bets. Payouts, pending/failed/reversed
transactions and other providers are excluded. Built-in games retain their
existing settled-wager rules. Existing Tulasi ledger history is included directly;
no wallet backfill or rewrite of already-issued rewards is performed.

`global:announcement` uses the existing `GAME_WIN` payload and policy. Tulasi wins
are grouped by player, provider game ID and round start. The amount is total
payout minus all round wagers. Messages require matched bets, a single attributable
room, positive profit, the configured threshold, and existing room/user privacy
checks. They wait for recorded game end and two seconds without another callback.
A durable provider-round receipt prevents duplicate announcements; the full round
is rechecked before dispatch. Late changes suppress a stale banner. Old events
outside the announcement lifetime are not replayed. There is no provider callback
that certifies every possible later correction, so a late correction after dispatch
does not produce a second announcement.

Deployment adds concurrent reporting indexes and a transactional room-cache
invalidation trigger, with a three-second DDL lock timeout. It does not modify
wallet balances. A cache-key version separates old and new workers during rolling
activation. Rollback is the previous release; the additive indexes/trigger can
remain installed safely.
