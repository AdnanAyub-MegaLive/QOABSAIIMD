# Mega Live Portal

Mega Live Portal is the administration backend and mobile API for Mega Live.
It manages users, hosts, agencies, events, wallets, messaging, live audio-room
seats, and real-time Socket.IO activity.

## Stack

- Next.js 16 and React 19
- PostgreSQL with Prisma
- Socket.IO for real-time portal and mobile events
- LiveKit for Android audio and video rooms

## Portal staff accounts and permissions

Open **Accounts & Permissions** in the sidebar to create portal staff logins.
Managers can choose permissions using module/action checkboxes, or start with
the Read only, Room moderator, Content manager, or Finance officer templates.
Only permissions the manager currently holds can be granted. Actions require
their corresponding module's View permission.

- `SUPER_ADMIN` retains full access and cannot be edited through this screen.
- `MANAGER` can delegate account administration when explicitly permitted.
- `STAFF` receives selected operational permissions without account administration.
- Managers manage only accounts created beneath them, not peers or themselves.
- Parent suspension or permission removal restricts descendant accounts too.
- Account changes, password resets and session revocation invalidate the affected
  account's existing portal sessions. Permission checks run on the server, not
  only through sidebar visibility. Attempts at forbidden operations return 403.
- Account changes are recorded in the access-management audit history.

Permission groups cover dashboard, users, hosts, agencies, finance, platform
rules, uploads, room management, daily tasks, red envelopes, room appearance,
room games, games, live video, notifications, content moderation, rankings,
messages, audit logs and account administration. Wallet adjustments, password
resets, private messages and account deletion have separate permissions.
The independent Events module retains its own authentication/authorization;
these checkboxes do not grant Events accounts or permissions.

Deployment: run `npx prisma migrate deploy`, regenerate Prisma Client, and
restart the portal. Existing portal sessions must sign in again. The seeded
Manager's legacy environment password is migrated to a database bcrypt hash
on its first successful login; subsequent authentication uses that hash.
New staff passwords are stored as bcrypt hashes, never in environment variables.

Verification: `npm test` includes the permission-policy tests. With the local
portal running, `node scripts/test-portal-staff-http.mjs` exercises real login,
delegation, forbidden access and session invalidation using temporary accounts
and removes those fixtures afterwards.

## Configure

### Local PostgreSQL on this Mac

The development database uses the installed PostgreSQL 18 binaries in
`/Library/PostgreSQL/18/bin`, listens on `127.0.0.1:5433`, and stores its data
in the ignored `.local/postgres/data` directory. Its connection URL and generated
administrator credentials are in `.env.local`.

```sh
npm run db:local:start   # Start after a reboot or manual stop
npm run db:local:status
npm run dev
# When finished:
npm run db:local:stop
```

This fresh local database was initialized with `prisma db push` and `npm run
db:seed`. The checked-in migrations lack the original base schema, so this
database does not have migration history. Do not run `prisma migrate deploy`
against it until a migration baseline is established. Do not use this local
bootstrap procedure for an existing database.

Create `.env.local` with the database, authentication, and LiveKit values required
by your deployment. Do not commit this file.

```dotenv
DATABASE_URL=postgresql://...
AUTH_SECRET=replace-with-a-long-random-value
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_TOKEN_TTL_SECONDS=600
MOBILE_API_BASE_URL=https://portal.example.com
MOBILE_SESSION_TTL_SECONDS=2592000
MOBILE_APP_ORIGIN=https://your-browser-client.example
```

When LiveKit is configured, clients request a room-scoped credential
from `POST /api/v1/audio-rooms/livekit-token`. Listeners receive subscribe-only
access, while only the room owner or a currently seated user may publish. The
LiveKit API key and secret must remain on the portal server.

For the complete JDAX Android integration contract and Kotlin example, see
[`docs/mobile-audio-room-api.md`](docs/mobile-audio-room-api.md).

New Android work uses the versioned [`/api/v1` mobile contract](docs/mobile-api-v1.md).
See the [cutover runbook](docs/portal-cutover-runbook.md) before migrating live
legacy users or balances.

## Mobile messaging

Gift animation grouping supports optional per-action `giftBatchId` on standard,
backpack and lucky sends. See [the gift batch contract](docs/gift-batch-contract.md)
for validation, event fields and rollout requirements. Each recipient still has
an independent transaction and event.

Portal Socket.IO messaging replaces Tencent IM for direct conversations,
user-created groups, and the fixed `CONV-WORLD` World Chat.
Clients authenticate the Socket.IO handshake with their opaque portal session
token. The portal persists every recipient's delivery and read receipt, emits
the corresponding real-time events, and exposes reconnect/offline sync through
the versioned API.

```text
GET/POST /api/v1/conversations
POST     /api/v1/conversations/groups
POST     /api/v1/conversations/:conversationId/members
DELETE   /api/v1/conversations/:conversationId/members/:userId
GET/POST /api/v1/conversations/:conversationId/messages
PATCH    /api/v1/conversations/:conversationId/messages/:messageId
DELETE   /api/v1/conversations/:conversationId/messages/:messageId
POST     /api/v1/conversations/:conversationId/read
POST     /api/v1/conversations/:conversationId/messages/:messageId/delivered
GET      /api/v1/conversations/sync?cursor=MSG-...&limit=50
GET/POST /api/v1/blocks
```

Run `npx prisma migrate deploy` during a release to apply the
`MessageReceipt` and `messaging_completion` migrations. They add group roles,
soft-message moderation and blocks without deleting existing messages. The
exact Socket.IO events and Android contract are in
[`docs/mobile-api-v1.md`](docs/mobile-api-v1.md#messaging-and-socketio-contract).

For the production HTTPS/WSS deployment contract and Android readiness check,
see [`docs/mobile-production-deployment.md`](docs/mobile-production-deployment.md).

## Host approval and public IDs

New mobile users receive an ID such as `USR-123123`. When an agency-linked user
is approved as an active, verified host, the portal preserves the numeric part
and changes the prefix to `TLN-123123`. The same database User record and its
wallet, gifts, rooms, devices, and social data are retained.

The old mobile session is invalidated and the portal emits `host:approved` with
`previousUserId`, `userId`, and `sessionInvalidated`. Android must replace its
stored user ID and sign in again; it must never create a `TLN` ID locally.

The rule is enforced for portal host management, administrator approval, and
agency-owner approval. See the [Android host transition guidance](docs/android-portal-integration-handoff.md#host-approval-id-transition).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Verify

The consolidated room-chat, Business Card, entertainment, live-video and
public-profile contracts are documented in
[`docs/feature-parity-completion.md`](docs/feature-parity-completion.md).

## Room chat recovery

Room chat is persisted in Prisma and recovered on every `audio-room:join`
acknowledgement through `chatHistory`. Older pages are available from
`GET /api/v1/audio-rooms/{roomId}/messages` using the opaque `nextCursor`.
Clients should attach a stable `requestId` to `audio-room:message`; retrying the
same request returns the original message with `duplicate: true` and does not
broadcast it twice.

Member-visible history is retained for 30 days. `audio-room:clear-chat` does
not permanently delete records: it atomically advances `chatRevision`, records
`chatClearedAt`, and broadcasts the new revision. Earlier revisions remain in
the database for audit/moderation but are excluded from member history.

## Business Cards

Business Cards use the existing Upload, Store, entitlement, purchase, and
equip pipeline under category `BUSINESS_CARD`. They may be PNG, JPEG, WebP, or
MP4. Video cards require a separate PNG/JPEG/WebP poster (maximum 5 MB).
Equipped DTO fields are `businessCardUrl`, `businessCardPosterUrl`, and
`businessCardMimeType`; they are returned on current profiles, room seats, and
room-member snapshots. The poster is served through the same signed public
display route with `poster=1`.

Games Management is available at `/games-management` using the portal admin
login. See [game setup, wallet settlement, and the mobile launch contract](docs/games-management.md).

```bash
npm test
npm run lint
npm run build
```

## Notes

- LiveKit is the only media transport. Socket.IO and Prisma remain the
  authoritative source for room membership, seats, and publish permission.
