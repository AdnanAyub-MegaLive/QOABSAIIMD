# Games Management

The game portal migrated from Mega-Live is available at `/games-management`.
It uses the main portal administrator login, PostgreSQL/Prisma, existing mobile
accounts, and `User.coinBalance`. MongoDB, the Chinese management portal,
`open_get_userinfo`, `open_submitFlow`, and external wallet/private-key
configuration are not used.

## Administrator workflow

- Open **Games Management** from the sidebar, dashboard, or feature search.
- Lucky Flip and Roulette are created paused when the catalog is first opened.
- Configure bet limits and availability. Lucky Flip supports win probability
  and gross payout multiplier; Roulette supports all 37 pocket weights.
- Preview either game using practice coins. Previews use the saved configuration
  with availability temporarily enabled only in browser memory, even if the real
  game is paused. No wallet entries or round records are written by previews.
- Activate a game to expose it in the authenticated mobile catalog.
- Review round receipts, filter/search logs, export CSV, and inspect settings
  revisions. Dashboards and exports cover the loaded records (initially 1,000);
  load older records to extend that range. Audit history shows the latest 100 changes.

Every round retains its accepted configuration. Settings updates use revision
checks and serialize with wager acceptance. A game's engine cannot be changed
after creation. Additional configurations of Lucky Flip can be added; new
engines still require implementation.

## Mobile launch

1. Request `GET /api/v1/games` with `Authorization: Bearer <mobile session token>`.
   The normal v1 response contains `data.games`, including each game's settings
   and `launchUrl`. Only active games are returned.
2. Open the selected URL in the app WebView, adding an optional `roomId` query
   parameter and the current mobile session token in the **URL fragment**:

   ```text
   https://portal.example.com/games/play?game=roulette&roomId=ROOM-123#token=<URL-encoded-mobile-session-token>
   ```

   Use the same origin as the configured `AUTH_URL` and `MOBILE_API_BASE_URL`.
   Fragments are not sent to the web server or in HTTP referrers. Do not log or
   persist launch URLs in mobile analytics. Query-token compatibility exists,
   but the fragment form avoids credentials in HTTP request URLs.
3. The player immediately removes the token from the address bar and posts
   `{ action: "launch", token, roomId }` to `/api/games/player`.
4. The server validates this portal's mobile signature and current account/device
   state. It stores only the verified claims plus a hash of a new random game
   session ID. The browser receives a scoped HTTP-only cookie, valid for at most
   two hours and never beyond the mobile token's expiry.
5. All profile reads and wagers recheck expiry, account status, session version,
   forced logout, identity, and device bans. Reopen from the app after expiry.

The game cookie is same-site and secure in production. Games are intended to
open as a top-level WebView page on the portal origin, not a cross-site iframe.
`roomId` is optional attribution, not membership authorization. Rounds are
independent per player; there is no shared timed room spin.

## Player requests

`POST /api/games/player` requires the game cookie, JSON, and the portal Origin.
Responses use `{ error: "message" }` for failures and `Cache-Control: no-store`.

| Action | Additional fields | Response |
| --- | --- | --- |
| `launch` | `token`, optional `roomId` | `user`, `games`, `roomId`, `live` |
| `profile` | none | `user`, `games`, `roomId`, `live` |
| `bet` | UUID `id`, `gameId`, `revision`, integer `bet`, and `choice` for Flip or `bets` map for Roulette | `{ round }` |
| `round` | `id` | `{ round }`, restricted to the current player |

The profile uses native `userId` and `nickname`; `availableCoins` is an integer
string to preserve large wallet balances. Roulette's `bet` must equal the sum of
the validated market bets. An operation ID must be reused only for the same
accepted request; a conflicting reuse returns HTTP 409. A replay returns the
original receipt without any further wallet mutation, including after a game
has been paused. A missing receipt returns 404; the UI never automatically
submits a replacement wager after an uncertain response.

## Settlement and storage

`GameDefinition`, `GameRound`, `GameSettingsAudit`, and `GamePlayerSession` are
Prisma models. Each accepted wager locks its game and user rows, validates
rules and funds, chooses an outcome with Node's cryptographic random generator,
updates the coin balance, and writes the round, existing `GameLog`, and wallet
ledger entries in a single PostgreSQL transaction.

The ledger uses `GAME_WAGER` (debit) and `GAME_PAYOUT` (credit). Gross payout
includes the stake. Failed transactions roll back all writes. Unique operation
IDs, request fingerprints, row locks, and wallet references prevent duplicate
charges and concurrent overspending. Game history appears in existing user
profiles and the wallet ledger. Settings changes also enter the main audit log.

Expired game sessions are rejected by every request; operators can periodically
delete expired `GamePlayerSession` rows as ordinary database maintenance.

## Setup and verification

For an existing database managed by Prisma migrations:

```sh
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

The additive migration is `20260922190000_game_management`. The local database
created earlier with `prisma db push` had that migration's SQL applied directly;
do not rerun it there. A database initialized with `db push` needs a proper
migration baseline before adopting `migrate deploy`.

No additional game secret or database service is needed. The existing
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, and `MOBILE_API_BASE_URL` settings apply.
The source project's historical MongoDB data was not imported.

```sh
npm test
npm run test:games:db
npm run test:games:http
npm run build
```

The database test creates and drops a uniquely named disposable database on the
configured PostgreSQL server; its database user must have database creation
permission. It verifies revisions, duplicate/reused operations, concurrent
spending, roulette settlement, ledger consistency, rollback and revoked sessions.
It never places wagers against the application database.

The HTTP smoke test requires the local portal to be running. It creates a
temporary player and game in the local application database, checks the entire
launch/wager/receipt flow, then removes only those fixtures and their records.
