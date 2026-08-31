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

Country is assigned once, at registration, from the portal edge/proxy
geolocation header and returned as an ISO alpha-2 code (for example `PK`). The
Android request must not send or edit country. The production reverse proxy must
strip inbound `CF-IPCountry`, `X-Vercel-IP-Country`, and `X-Geo-Country` headers
and write its own trusted country header; otherwise registration returns
`503 GEOLOCATION_UNAVAILABLE`.

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
| Update own profile | `PATCH /api/v1/users/me` | Uses the current profile DTO |
| Read/manage own room | `GET`/`POST /api/v1/audio-rooms` | Existing room DTO and TRTC rules apply |
| Discover/search rooms | `GET /api/v1/audio-rooms/discover?country=PK` and `/search` | Returns listener-joinable `LIVE` rooms only; country is an optional ISO alpha-2 discovery filter |
| Request TRTC credentials | `POST /api/v1/audio-rooms/trtc-token` | Requires an active room and portal session |
| Wallet overview | `GET /api/v1/wallet` | Coin, diamond/salary, coupon, and recharge balances |
| Coin packages | `GET /api/v1/wallet/coin-packages` | Active provider-neutral packages and prices |
| Wallet ledger | `GET /api/v1/wallet/transactions?limit=20&cursor=...` | Cursor-paginated, immutable financial history |
| Start a top-up | `POST /api/v1/wallet/top-ups` | Requires an `Idempotency-Key` header in production |
| Transfer coins | `POST /api/v1/wallet/transfers` | Coin-only, server-enforced transfer limits |
| Withdraw host earnings | `GET`/`POST /api/v1/wallet/withdrawals` | KYC-verified, agency-linked hosts only |
| Gift catalog | `GET /api/v1/gifts/catalog` | Existing uploaded gift assets only; no media is generated |
| Send a gift | `POST /api/v1/gifts/send` | Atomically settles sender, host, agency, and company shares |

Socket.IO, social, agency, advanced gift economy, and payout-provider operations
will be added to v1 one domain at a time. Until an operation appears here, it is
not a stable v1 contract.

## Audio-room activation authorization

An audio room may retain its public room ID while its status is `IDLE`; that ID
does not represent a live, joinable session. The owner alone may create, start,
or restart their assigned room through `POST /api/v1/audio-rooms` with
`action: "START"`. A Socket.IO `audio-room:join` request is a listener join,
not a start operation: only `LIVE` rooms can be joined. Joining an `IDLE` room
returns `ROOM_IDLE` and does not alter its status, participant count, or seat
state. Discovery and search return `LIVE` rooms only.

This is an explicit MegaLive product policy. Any change to these authorization
rules requires explicit product approval and matching regression-test updates.

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
or any TRTC signing secret to Android.

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
