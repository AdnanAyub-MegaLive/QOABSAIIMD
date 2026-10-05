# Mega Live Portal Mobile API v1

`/api/v1` is the stable mobile API contract for new Android work. Existing
`/api/...` endpoints remain temporarily available only for compatibility while
the application moves screen-by-screen to v1.

## Contract discovery

```http
GET /api/v1
```

The response publishes the API version, response envelope, pagination rules,
and the currently released v1 endpoints. Clients may use it for a startup
compatibility check, but must not silently switch API versions.

## Common request and response rules

All protected endpoints require:

```http
Authorization: Bearer <portal-session-token>
```

Send an optional, client-generated `X-Request-Id` (8–128 letters, digits,
periods, underscores, or hyphens). The portal returns it as `X-Request-Id` and
records it in the request audit log. This makes a mobile error traceable without
logging credentials or request bodies.

Success responses use:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable explanation"
  }
}
```

Use the HTTP status plus `error.code`; do not parse human messages.

| Status | Meaning |
| --- | --- |
| 400 | Invalid JSON or malformed request |
| 401 | Missing, expired, revoked, mismatched, or invalid session |
| 403 | Banned device/account or insufficient role |
| 404 | Resource does not exist |
| 409 | Conflicting state, such as a duplicate registration |
| 422 | Valid JSON with invalid fields |
| 429 | Rate limit reached; retry later |
| 500/503 | Temporary server or dependent-service error |

Collection endpoints added after this first release use cursor pagination:

```text
GET /api/v1/resource?limit=20&cursor=<opaque-cursor>
```

`limit` defaults to 20 and cannot exceed 100. A response with more data returns
`data.nextCursor`; clients must treat it as opaque.

## Identity policy

Portal `userId` and `roomId` values are public strings, never database primary
keys, and must remain strings in Android DTOs and persistence. Room IDs are
permanent. A user ID has one server-issued exception: once an agency-linked
user is approved as an active, verified host, its prefix changes while its
numeric suffix stays the same: `USR-123123` becomes `TLN-123123`.

Android must never construct this ID itself. On the `host:approved` Socket.IO
event, or after `401 INVALID_SESSION` / `401 SESSION_REVOKED`, clear the old
session, replace persisted `USR-*` identity references with the server-provided
`TLN-*` ID, and sign in again. `SESSION_REVOKED` is used for session-version
changes, forced logout, deleted or inactive accounts, and other server-side
security invalidations; `INVALID_SESSION` covers expired or unresolvable
tokens. The new login response is the source of truth. The underlying User,
wallet, gifts, room ownership, and social relations do not change.

The old application used numeric IDs. During migration, the portal stores each
approved numeric-to-public-ID relation in `LegacyIdMapping`. The Android app
must use the current portal public ID after a portal login; it must not convert
it back to a legacy number.

The import command accepts a reviewed export, never a direct connection to the
old production database:

```text
npm run legacy-ids:import -- --file C:\path\legacy-id-mappings.json --dry-run
npm run legacy-ids:import -- --file C:\path\legacy-id-mappings.json
```

Input format:

```json
{
  "users": [
    { "legacyId": "123456", "publicId": "USR-654321" }
  ],
  "audioRooms": [
    { "legacyId": "987654", "publicId": "ROOM-ABC123" }
  ]
}
```

The dry run validates all IDs and rolls back. The real import is atomic: a
legacy ID cannot silently point to a different portal account or room.

## Device policy

Modern Android cannot provide a reliable physical MAC address. Send a stable
app-installation identifier as `device.deviceId` at registration/login and as
`deviceId` for session validation. Generate it once, store it in encrypted app
storage, and do not use Android hardware identifiers or a Wi-Fi MAC address.

For backward compatibility, the portal also accepts `macAddress` as an alias.
The database column retains that old name internally, but all new mobile code
must use `deviceId`.

Country is assigned once at registration. Android sends the user's picker
selection as an English country name or ISO alpha-2 code; the portal stores the
canonical ISO-2 value. A trusted edge/proxy country header is fallback-only when
the client omits country. Missing client and edge values do not block signup and
produce a null country. An explicitly invalid client value returns 422 and is
never replaced by the connection country. The two values are never compared.
The production proxy must still strip inbound geo headers before writing trusted
fallback headers.

## Released endpoints

| Operation | Endpoint | Notes |
| --- | --- | --- |
| Discover v1 contract | `GET /api/v1` | No authentication required |
| Login | `POST /api/v1/auth/login` | Device ID and location required |
| Register | `POST /api/v1/auth/register` | `device.deviceId` required in v1 |
| Google sign-in | `POST /api/v1/auth/google` | Server-verifies a Google ID token; device ID and location required |
| Change password | `POST /api/v1/auth/password` | Authenticated password change |
| Validate session | `GET /api/v1/auth/session?deviceId=...` | Validates the token and device binding |
| Refresh session | `POST /api/v1/auth/refresh` | Requires a device-bound session |
| Logout | `POST /api/v1/auth/logout` | Invalidates all portal sessions for that user |
| Read/update own profile | `GET`/`PATCH /api/v1/users/me` | Current server-authoritative profile DTO, including ISO alpha-2 `country` |
| Read/manage own room | `GET`/`POST /api/v1/audio-rooms` | Existing room DTO and LiveKit rules apply |
| Discover/search rooms | `GET /api/v1/audio-rooms/discover?country=PK&includeIdle=true` and `/search?includeIdle=true` | Defaults to listener-joinable `LIVE` rooms; `includeIdle=true` also returns visible `IDLE` rooms, while blocked/terminated rooms remain excluded |
| Request LiveKit credentials | `POST /api/v1/audio-rooms/livekit-token` | Publish requires room ownership or a persisted seat |
| Wallet overview | `GET /api/v1/wallet` | Coin, diamond/salary, coupon, and recharge balances |
| Coin packages | `GET /api/v1/wallet/coin-packages` | Active provider-neutral packages and prices |
| Wallet ledger | `GET /api/v1/wallet/transactions?limit=20&cursor=...` | Cursor-paginated, immutable financial history |
| Start a top-up | `POST /api/v1/wallet/top-ups` | Requires an `Idempotency-Key` header in production |
| Transfer coins | `POST /api/v1/wallet/transfers` | Reseller-only coin transfers, server-enforced transfer limits |
| Withdraw host earnings | `GET`/`POST /api/v1/wallet/withdrawals` | KYC-verified, agency-linked hosts only |
| Gift catalog | `GET /api/v1/gifts/catalog` | Existing uploaded gift assets only; no media is generated |
| Send a gift | `POST /api/v1/gifts/send` | Atomically settles sender, host, agency, and company shares |
| List messaging conversations | `GET /api/v1/conversations` | Direct, group, and fixed World Chat conversations |
| Start or return a direct conversation | `POST /api/v1/conversations` | Body: `{ "participantId": "USR-* or TLN-*" }` |
| Create a group | `POST /api/v1/conversations/groups` | Creator is the owner; body has `name` and 1–99 `participantIds` |
| Add/remove group member | `POST /api/v1/conversations/:conversationId/members` / `DELETE .../members/:userId` | Group owner manages members; non-owner can remove only themselves |
| Get/send conversation messages | `GET`/`POST /api/v1/conversations/:conversationId/messages` | Server-persisted chronological message history |
| Edit/delete own message | `PATCH`/`DELETE /api/v1/conversations/:conversationId/messages/:messageId` | Editing is limited to 15 minutes; deletion is a soft delete |
| Mark a conversation read | `POST /api/v1/conversations/:conversationId/read` | Updates persistent read receipts |
| Mark a message delivered | `POST /api/v1/conversations/:conversationId/messages/:messageId/delivered` | Idempotent recipient delivery acknowledgement |
| Synchronize missed messages | `GET /api/v1/conversations/sync?cursor=MSG-...&limit=50` | Reconnect/offline incremental sync across caller conversations |
| List/create a block | `GET`/`POST /api/v1/blocks` | Prevents direct messages and friend requests for the blocked pair |
| Remove a block | `DELETE /api/v1/blocks/:userId` | Restores direct interaction for the pair |

Socket.IO, social, agency, advanced gift economy, and payout-provider operations
will be added to v1 one domain at a time. Until an operation appears here, it is
not a stable v1 contract.

## Profile bio (Evaluation)

The legacy Android label **Evaluation** maps to the nullable `bio` field. Read
it from `GET /api/v1/users/me` and update only the authenticated account with:

```http
PATCH /api/v1/users/me
Authorization: Bearer <portal-session-token>
Content-Type: application/json

{ "bio": "Welcome to my profile!" }
```

`bio` is plain text with a maximum of 200 Unicode characters. Send `null` or
an empty/whitespace-only string to clear it. Invalid values return `422
VALIDATION_ERROR` with `error.fields.bio`. The same nullable `bio` is included
in all authentication responses that contain `data.user`, and in profile GET
and PATCH responses.

## Messaging and Socket.IO contract

Socket.IO replaces Tencent IM for the released portal messaging scope. Connect
to the configured Socket.IO base URL with the opaque portal session token:

```js
io(PORTAL_SOCKET_BASE_URL, {
  auth: { token: sessionToken },
  transports: ["websocket", "polling"],
});
```

The server validates the token, account/session version, device binding, device
ban, and account ban before accepting the connection. A connection failure code
is one of `INVALID_SESSION`, `SESSION_REVOKED`, `DEVICE_NOT_REGISTERED`,
`DEVICE_BANNED`, or `ACCOUNT_BANNED`. On `INVALID_SESSION` Android may attempt
the documented refresh flow. On `SESSION_REVOKED` it must clear the local
session. On a banned-device or banned-account error it must stop reconnecting
and show the returned server message.

All client events below use an acknowledgement callback. Its envelope is always
one of:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": { "code": "MACHINE_READABLE_CODE", "message": "..." } }
```

| Event | Client payload | Successful acknowledgement / server event |
| --- | --- | --- |
| `message:send` | `{ "conversationId": "CONV-*", "body": "1-2000 chars" }` | `{ conversationId, message }`; emits `message:new` to participants |
| `message:edit` | `{ "conversationId": "CONV-*", "messageId": "MSG-*", "body": "1-2000 chars" }` | `{ conversationId, message }`; emits `message:updated` |
| `message:delete` | `{ "conversationId": "CONV-*", "messageId": "MSG-*" }` | `{ conversationId, message }`; emits `message:deleted` with a null body |
| `message:delivered` | `{ "conversationId": "CONV-*", "messageId": "MSG-*" }` | `{ conversationId, messageId, userId, deliveredAt }`; emits the same event |
| `conversation:read` | `{ "conversationId": "CONV-*" }` | `{ conversationId, userId, lastReadAt }`; emits the same event |
| `conversation:typing` | `{ "conversationId": "CONV-*", "isTyping": true }` | Emits to other participants with a five-second `expiresAt`; max two updates/second/socket |
| `conversation:sync` | `{ "cursor": "MSG-* or null", "limit": 1-100 }` | `{ messages, nextCursor, hasMore }` |
| `conversation:created` / `conversation:updated` | Server event | Full group conversation after creation or membership update |
| `session:status` | Server event on connect | session status and account flags |

`message:new` has this payload:

```json
{
  "conversationId": "CONV-WORLD",
  "message": {
    "id": "MSG-...",
    "senderId": "USR-...",
    "senderName": "...",
    "senderProfileImage": null,
    "senderFrameUrl": null,
    "senderBadgeUrl": null,
    "senderChatBoxUrl": null,
    "body": "Hello",
    "createdAt": "2026-09-01T12:00:00.000Z",
    "editedAt": null,
    "deletedAt": null
  }
}
```

After persisting a received message locally, Android emits `message:delivered`.
After displaying a conversation, Android emits `conversation:read`. Both
operations are idempotent; the server time is authoritative. Reconnect with the
last successful `nextCursor` using either `conversation:sync` or
`GET /api/v1/conversations/sync`. A cursor belongs to one authenticated user;
another user's or an unknown cursor returns `422 SYNC_CURSOR_INVALID`.

The REST alternatives return the same data in the standard v1 envelope. Message
history returns chronological `messages`, `nextCursor`, and `hasMore`.

Released messaging scope is direct messages, user-created groups, and fixed
`CONV-WORLD` World Chat. A group creator is its `OWNER`; the owner can add or
remove members. Members may remove themselves. The owner cannot leave or be
removed until ownership-transfer support is introduced. Group actions are REST
operations and publish `conversation:created` or `conversation:updated` to all
members.

Messages are edited only by their sender during the first 15 minutes. Senders
can soft-delete their messages at any time; the original body is no longer sent
to mobile clients and the returned message has `body: null` plus `deletedAt`.
The server retains the record for integrity and moderation purposes.

`POST /api/v1/blocks` creates a one-way privacy block. Any block in either
direction hides the direct conversation from the blocker and prevents new
direct messages and friend requests between the pair. Existing group membership
and World Chat are not changed by a block. The other user is not notified of a
block action.

The portal deliberately has no background-push provider. Android receives
messages over its authenticated Socket.IO connection while it is connected, and
uses `conversation:sync` after reconnecting. A closed Android app will not be
woken for a new chat message.

## Audio-room activation authorization

An audio room retains its public room ID while its status is `IDLE`. Both `LIVE`
and `IDLE` rooms are listener-joinable through Socket.IO `audio-room:join`.
The existing successful-join flow promotes an `IDLE` room to `LIVE`, updates
its participant count, and returns the normal seat snapshot. The owner may
still explicitly create, start, or restart their assigned room through
`POST /api/v1/audio-rooms` with `action: "START"`.

Discovery and search return `LIVE` rooms by default; use `includeIdle=true` to
show both states. Blocked and terminated rooms are never joinable or returned.

## Wallet and payment contract

All amounts that can exceed JavaScript safe integer precision are JSON strings.
In particular, send `coins` as a decimal string and persist returned coin or
diamond values as strings in Android. Never calculate a balance or a payout on
the device.

Start a top-up with an active package ID and allowed payment method:

```http
POST /api/v1/wallet/top-ups
Authorization: Bearer <portal-session-token>
Idempotency-Key: 8b6e9334-4e4c-4e48-b1f4-0d7018c07fa6
Content-Type: application/json

{ "packageId": "<package-id>", "paymentMethod": "jazzcash" }
```

The response contains a portal order ID, trusted amount/currency, and a
provider checkout URL. Reuse the same idempotency key only when retrying the
identical request. A changed package or payment method with the same key returns
`409 IDEMPOTENCY_KEY_REUSED`.

The **payment provider**, not Android, confirms a result at
`POST /api/wallet/top-ups/webhook`. The provider adapter must send the exact raw
JSON body together with these headers:

```text
X-Wallet-Timestamp: Unix seconds
X-Wallet-Signature: base64url(HMAC-SHA256(PAYMENT_WEBHOOK_SECRET, "<timestamp>.<raw-body>"))
```

The portal rejects stale signatures (five minutes by default), malformed JSON,
and a reused provider reference. An order resolves only once; a retry with the
same provider reference is safe. `PAYMENT_WEBHOOK_ALLOW_LEGACY_SECRET` is a
temporary compatibility switch and must stay `false` in production.

Withdrawals reserve host salary diamonds, then progress through `PENDING →
APPROVED → COMPLETED` or `REJECTED`. A finance administrator performs the final
approval and records the provider payout reference. Rejections create a linked
immutable diamond refund ledger entry. Android must display the returned status
and payout/rejection detail; it must never mark a withdrawal as paid itself.

Gift sends use the existing uploaded `GIFTS` assets. The portal stores the gift
transaction, the wallet debit/credit rows, the agency/host/company settlement,
and its policy version in one database transaction. The mobile client receives
the settled values for display only.

For a room gift, `POST /api/v1/gifts/send` requires a `LIVE` `roomId` and both
the sender and `recipientId` to be joined to that room through Socket.IO. The
sender may use their own public ID as `recipientId` while in the room. A missing
participant returns `403 ROOM_PARTICIPANT_REQUIRED` before any coins are debited.
Self gifting without a `roomId` remains invalid.

Audio-room seat expressions use the authenticated Socket.IO event
`audio-room:reaction:send` and the `audio-room:reaction` broadcast. The portal
accepts `gif_0` through `gif_21`, derives sender and seat identity from room
state, generates the shared dice value for `gif_0`, and does not persist or
replay these events. See `docs/mobile-socket-api.md` for the exact contract.

Password-reset delivery by SMS or email is deliberately not enabled yet: the
portal needs an approved delivery provider, sender identity, verification-code
policy, and abuse limits before it can safely issue reset tokens. The existing
authenticated password-change operation is available now.

## Session lifecycle

Successful login, registration, and refresh responses return the same session
fields: `sessionToken`, `tokenType` (`Bearer`), `expiresAt` (an ISO-8601 UTC
timestamp), and `sessionVersion`. Store the opaque token only in encrypted
Android storage and send it to Socket.IO as the handshake token. Android must
not decode the token or assume a fixed lifetime; use the server-supplied
`expiresAt` to schedule refresh. `POST /auth/logout` increments the account
session version and disconnects all of that account's portal sockets.

The default token lifetime is 30 days and is configured server-side with
`MOBILE_SESSION_TTL_SECONDS` (5 minutes to 90 days). Never expose `AUTH_SECRET`
or any LiveKit signing secret to Android.

## Google Sign-In

`POST /api/v1/auth/google` accepts an Android-acquired Google ID token over
HTTPS. The portal verifies the token signature, issuer, expiry, and audience
using `GOOGLE_SERVER_CLIENT_ID`; Android must not send a Google client secret.

```json
{
  "idToken": "<google-id-token>",
  "phone": "+923001234567",
  "device": {
    "deviceId": "stable-installation-id",
    "location": "Lahore, Pakistan",
    "platform": "Android",
    "deviceName": "Pixel 8"
  }
}
```

`phone` is optional for Google Sign-In accounts. When supplied, it must contain
7 to 15 digits and is unique across all accounts. A successful response uses
the same session DTO as login, registration, and refresh, with `data.user`
included.
The portal stores Google’s immutable `sub` claim, never an email address, as
the Google-account identifier. A third-party email already owned by an existing
portal account is not auto-linked; return `409 GOOGLE_ACCOUNT_LINK_REQUIRED`.

## Rate limits and production operation

The v1 layer applies endpoint-specific limits: login/registration are limited
to 5 requests per minute per client IP; refresh/logout to 12; and ordinary
read/update endpoints use higher limits. Request logs are stored in
`ApiRequestLog` without tokens or bodies.

The current limiter is process-memory based and is correct for a single Node
server only. Before scaling the portal to multiple instances, replace it with a
shared atomic limiter (for example Redis) and make the reverse proxy overwrite
client-supplied forwarding headers. This is a deployment requirement, not an
Android change.

## Reseller accounts

Managers with user-role management permissions can assign `RESELLER` through
Users → Adjust role. This is a mobile application role, not a portal staff role.
Managers with `finance.adjust` can fund the user through the existing Add Coins
action; both funding and transfers write wallet ledger entries.

`GET /api/v1/wallet` includes `canTransferCoins`. Mobile clients should show the
send-coins action only when this flag is true. `POST /api/v1/wallet/transfers`
(and the legacy endpoint) requires an active Reseller, otherwise returns HTTP 403
with `RESELLER_REQUIRED`. The request remains `{ "recipientPublicId": "USR-…",
"coins": "100" }`. Transfers debit the Reseller and credit an active recipient
atomically, subject to balance and configured transfer limits.

In Uploads, select **Reseller role reward** under **How users obtain it** for each
item to grant. Existing configured items are granted when the role is assigned;
newly configured rewards are synchronized when the user loads props or the store.
The configured ownership duration applies and is not restarted by reads. Removing
the role removes only role-sourced rewards, preserving purchased or manually
granted ownership. Reassigning the role grants its rewards again. These items can
be equipped through the existing props API. No arbitrary uploaded items are granted.

## BD agency management

`BD` is an application role assigned through Users → Adjust role. It does not
provide portal staff access. Applicants supply the active BD's user public ID in
`bdCode`; free-text codes that do not identify an active BD are rejected.

| Action | Endpoint | Access |
| --- | --- | --- |
| Find a BD | `GET /api/v1/bds?q=...` | Signed-in mobile users; up to 100 matches |
| Apply under a BD | `POST /api/v1/agencies/apply` | Signed-in mobile users |
| List assigned applications | `GET /api/v1/bd/applications?status=PENDING` | BD; only their applications, up to 100 newest |
| Approve or reject | `PATCH /api/v1/bd/applications/{applicationId}` | The application's BD only |
| Grant an agency directly | `POST /api/v1/bd/agencies` | Active BD |
| List granted/approved agencies | `GET /api/v1/bd/agencies` | BD; only their agencies, up to 100 newest |

Application request: `{ "agencyName": "Example", "whatsapp": "+923001234567",
"bdCode": "USR-123456" }`. The existing `/api/agencies/apply` route uses the same
validation and ownership links. Three rejections under the same BD retain the
existing application limit.

Review request: `{ "decision": "APPROVED", "note": "Optional note" }`, or
`{ "decision": "REJECTED", "note": "Required reason" }`. Another BD's application
returns 404; an already reviewed application returns 409. Approval creates an
agency owned by the applicant and linked to the supervising BD.

Direct grant request: `{ "agencyName": "Example", "ownerPublicId": "USR-123456" }`.
The server links the agency to the authenticated BD. Owners must be active and
cannot already own/belong to an agency or have a pending/approved application.
A direct grant creates an approved application record for existing owner flows.
Removing the BD role blocks their BD actions without deleting existing agencies.

Portal managers with `agencies.manage` can use **Agency Management → Create
agency**, backed by `POST /api/admin/agencies`. It accepts the same direct-grant
fields plus optional `bdCode`; omitting it creates an agency without a BD. The
portal can still review applications, including legacy applications whose BD
codes could not be matched. Reviewer identity and agency actions are audited.

Apply migration `20261002110000_bd_agencies` and regenerate Prisma Client when
deploying. Legacy applications are linked only where the code matches an existing
BD user ID. Run `node scripts/test-bd-agencies.mjs` against a running local portal
to check grants, approval ownership, role revocation, and portal permissions.
