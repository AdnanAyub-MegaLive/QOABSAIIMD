# Mega Live Portal

Mega Live Portal is the administration backend and mobile API for Mega Live.
It manages users, hosts, agencies, events, wallets, messaging, live audio-room
seats, and real-time Socket.IO activity.

## Stack

- Next.js 16 and React 19
- PostgreSQL with Prisma
- Socket.IO for real-time portal and mobile events
- Tencent TRTC for Android audio rooms
- LiveKit as an optional second Android audio provider

## Configure

Create `.env.local` with the database, authentication, and TRTC values required
by your deployment. Do not commit this file.

```dotenv
DATABASE_URL=postgresql://...
AUTH_SECRET=replace-with-a-long-random-value
TRTC_SDK_APP_ID=1400000000
TRTC_SECRET_KEY=your-tencent-trtc-secret
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_TOKEN_TTL_SECONDS=600
MOBILE_API_BASE_URL=https://portal.example.com
MOBILE_SESSION_TTL_SECONDS=2592000
MOBILE_APP_ORIGIN=https://your-browser-client.example
```

Enable **permission key verification** for the TRTC application in Tencent's
console. The portal issues short-lived, room-scoped Android credentials at
`POST /api/audio-rooms/trtc-token`; the Android app must never contain
`TRTC_SECRET_KEY`.

When LiveKit is configured, clients can request a second room-scoped credential
from `POST /api/v1/audio-rooms/livekit-token`. Listeners receive subscribe-only
access, while only the room owner or a currently seated user may publish. The
LiveKit API key and secret must remain on the portal server.

For the complete JDAX Android integration contract and Kotlin example, see
[`docs/mobile-audio-room-api.md`](docs/mobile-audio-room-api.md).

New Android work uses the versioned [`/api/v1` mobile contract](docs/mobile-api-v1.md).
See the [cutover runbook](docs/portal-cutover-runbook.md) before migrating live
legacy users or balances.

## Mobile messaging

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

```bash
npm test
npm run lint
npm run build
```

## Notes

- The `trtc-sdk-v5` package is the Web SDK. JDAX Android should integrate the
  native Tencent TRTC Android SDK and obtain its credentials from this portal.
- TRTC and LiveKit are both supported. Socket.IO and Prisma remain the
  authoritative source for room membership, seats, and publish permission.
