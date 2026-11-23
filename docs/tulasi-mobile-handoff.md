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
