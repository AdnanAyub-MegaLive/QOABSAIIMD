# MegaLive Android ↔ Mega Live Portal integration handoff

## Purpose and scope

This document is for the Android developer working in the recovered MegaLive
application project. It describes how to connect that application to this
portal. It does **not** require any change to the legacy application until the
developer starts the relevant phase.

The application already contains Tencent's native Android TRTC SDK. Do not add
LiveKit and do not place any Tencent secret keys in the application.

## Important starting point

The application source is recovered from a release bundle, not the original
Android Studio project. Make the Android rebuild compile and run reliably
before replacing its networking or voice-room code. Treat the current legacy
API client as a reference during migration, not as the portal API contract.

The portal's stable mobile APIs use the `/api/v1` prefix and the common envelope below:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

Every protected endpoint requires:

```http
Authorization: Bearer <sessionToken>
```

## Values to configure per environment

The Android build must receive these values through build configuration, never
from hard-coded production constants:

| Value | Meaning |
| --- | --- |
| `PORTAL_API_BASE_URL` | Public HTTPS base URL of the Mega Live Portal, including a trailing `/`. |
| `PORTAL_SOCKET_BASE_URL` | Public HTTPS/WSS Socket.IO base URL. It is normally the same host as `PORTAL_API_BASE_URL`. |
| `APP_VARIANT` | Development, staging, or production. Keep environments separate. |

The portal already has its Tencent TRTC App ID and secret configured on the
server. The Android application must obtain all TRTC join data from the portal
at runtime. It must not hard-code the App ID, a UserSig, a private-map key, or
any secret.

The production portal deployment must also set `MOBILE_APP_ORIGIN` to the
intended web origin(s), use HTTPS, and expose Socket.IO over WSS. Android does
not need browser CORS permission, but the portal must be publicly reachable by
the device.

## Phase 1 — make the Android rebuild reliable

Owner: Android developer.

1. Make the recovered application build, install, and launch from Android
   Studio before changing its API host or voice code.
2. Preserve its resources and existing user flows while fixing compile errors.
3. Do not depend on the legacy static API token, static secret, or decrypted
   `tc_rtc_sig` while implementing new portal-backed screens.
4. Keep clear-text traffic disabled for the new portal host. All portal traffic
   must use HTTPS/WSS.

The recovered app currently has a legacy API client with hundreds of endpoints;
the portal is not a drop-in replacement for that client. Add new portal code in
parallel rather than overwriting the old client in one change.

## Phase 2 — create a separate `PortalApi` client and session store

Owner: Android developer.

Create a separate Retrofit/OkHttp service, for example `PortalApi`, with a JSON
converter and an interceptor that adds:

```http
Authorization: Bearer <sessionToken>
```

Store the session token in encrypted Android storage. Clear it on logout,
`INVALID_SESSION`, `SESSION_REVOKED`, device ban, or forced logout. Do not use
the portal token as a Tencent IM UserSig.

Suggested DTOs:

- `PortalEnvelope<T>`: `success`, `data`, `error`
- `PortalError`: `code`, `message`, optional `fields` and `details`
- `PortalSession`: `sessionToken`, `tokenType` (`Bearer`), `expiresAt`,
  `sessionVersion`, user profile, stable device identifier
- `PortalTrtcAccess`: `sdkAppId`, `userId`, `userSig`, `privateMapKey`,
  `strRoomId`, `role`, `appScene`, `canPublish`, `expiresAt`

The device identifier field is named `macAddress` in the current API for
compatibility. On modern Android, supply a stable app-installation/device ID
(for example a generated installation ID stored securely); do not attempt to
read a physical Wi-Fi MAC address. Ask for user-granted location in the form
needed by the product and send a human-readable value.

## Phase 3 — authentication, profile, and session validation

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "phone": "+923001234567",
  "password": "...",
  "device": {
    "deviceId": "stable-installation-id",
    "location": "Lahore, Pakistan",
    "platform": "Android",
    "deviceName": "Pixel 8"
  }
}
```

Persist `data.sessionToken` and its server-returned `data.expiresAt` only after
a successful, non-banned response. Login, registration, and refresh share this
session payload. Treat the token as opaque: do not decode it or infer its
lifetime; schedule refresh using `expiresAt`.

### Google Sign-In

After Google Play services obtains an ID token, send it to
`POST /api/v1/auth/google` as `idToken` with the same stable device identifier
and login location used by password login. The portal, not Android, verifies the
token and issues the MegaLive session. `phone` is optional for Google Sign-In;
when supplied, it must be a valid 7-to-15-digit number. Do not include an OAuth
client secret, `AUTH_SECRET`, or any TRTC signing material in Android.
Use the returned portal public user ID for portal APIs and TRTC. Do not map it
back to the legacy numeric user ID.

### Host approval ID transition

When the portal approves an agency-linked user as an active, verified host, the
server changes only the public-ID prefix: `USR-123123` becomes `TLN-123123`.
The numeric suffix and all underlying account data remain the same. The server
emits `host:approved` with `previousUserId`, `userId`, and
`sessionInvalidated: true`; Android must replace the stored user ID, clear its
old token, and sign in again. Treat `401 INVALID_SESSION` as the fallback when
the app was offline during approval.

### Cold start and resume

```http
GET /api/v1/auth/session?deviceId=<stable-installation-id>
Authorization: Bearer <sessionToken>
```

Call this on cold start, foreground resume, and before protected room entry.
Handle `401 INVALID_SESSION`, account bans, device bans, and a changed
`sessionVersion` by clearing the local portal session.

### Profile

```http
PATCH /api/v1/users/me
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

Supported fields are `name`, `phone`, `email`, `profileImage`, `gender`, and
`dob` (`YYYY-MM-DD`). Country is assigned once by the portal from signup
geolocation and cannot be edited by Android. Gender and date of birth are
locked after their first assignment.

Detailed reference: [mobile-api-v1.md](mobile-api-v1.md),
[mobile-login-api.md](mobile-login-api.md), and
[change-password-api-spec.md](change-password-api-spec.md).

## Phase 4 — audio room REST flow

The portal owns room identity. A room ID is a string and must be kept as a
string everywhere in new portal code.

| Use case | Endpoint |
| --- | --- |
| Read the caller's assigned room | `GET /api/v1/audio-rooms` |
| Create, start, update, or end caller's room | `POST /api/v1/audio-rooms` |
| Discover other live rooms | `GET /api/v1/audio-rooms/discover` |
| Search rooms | `GET /api/v1/audio-rooms/search?q=...` |
| Request TRTC credentials | `POST /api/v1/audio-rooms/trtc-token` |

To start a host room:

```json
{
  "action": "START",
  "title": "My audio room"
}
```

The response gives `data.roomId`. Retain it as a string. The portal preserves
that room identity after a room ends; the next start reuses it. Its country is
derived from the owner’s signup geolocation, not a room request field.

Both `LIVE` and `IDLE` rooms are joinable with Socket.IO `audio-room:join`.
When a listener joins an idle room, the existing server join flow promotes it
to `LIVE` and returns the normal seat snapshot. Discovery and search return
only `LIVE` rooms by default; pass `includeIdle=true` to show both states.
Blocked and terminated rooms remain unavailable.

Do not send a media stream URL for TRTC audio. TRTC carries the live audio;
existing media assets remain separate room/profile presentation assets.

Detailed reference: [mobile-audio-room-api.md](mobile-audio-room-api.md).

## Phase 5 — Socket.IO and TRTC audio connection

### Socket.IO

Add a compatible Socket.IO Android client and connect after portal login:

```text
socket base URL: PORTAL_SOCKET_BASE_URL
handshake auth: { token: <sessionToken> }
transport: websocket preferred
```

Connect before joining a room. Listen for:

- `session:status`, `session:force-logout`, `account:banned`,
  `account:unbanned`, `device:banned`, and `device:unbanned`
- `audio-room:seat-update`, `audio-room:seat-kicked`,
  `audio-room:idle`, `audio-room:blocked`, `audio-room:terminated`, and
  `audio-room:owner-left`

Join the logical portal room first:

```text
audio-room:join { roomId }
```

Use the acknowledgement as the authoritative room and seat snapshot. Never
make client-side seat occupancy authoritative.

### TRTC

After the Socket.IO join acknowledgement, request credentials:

```http
POST /api/v1/audio-rooms/trtc-token
Authorization: Bearer <sessionToken>
Content-Type: application/json

{ "roomId": "<portal-room-id>" }
```

Use the response directly to populate `TRTCCloudDef.TRTCParams`:

```kotlin
params.sdkAppId = access.sdkAppId
params.userId = access.userId
params.userSig = access.userSig
params.privateMapKey = access.privateMapKey
params.strRoomId = access.strRoomId
params.role = if (access.canPublish) {
    TRTCCloudDef.TRTCRoleAnchor
} else {
    TRTCCloudDef.TRTCRoleAudience
}
trtcCloud.enterRoom(params, TRTCCloudDef.TRTC_APP_SCENE_VOICE_CHATROOM)
```

Do not use the old code path that decrypts `tc_rtc_sig`, hard-codes an older
TRTC App ID, assigns numeric `roomId`, or uses a legacy `rtc_token`. The portal
response is the single source of TRTC access data.

### Seat and microphone behavior

1. A listener enters TRTC as an audience member and cannot publish.
2. When taking a seat, emit `audio-room:seat-take`. On success, use
   `data.trtc` to leave/re-enter TRTC as an anchor before enabling the
   microphone.
3. On seat move, update UI from `seatState`; no role change is required unless
   the server returns a new `trtc` object.
4. On leave, kick, or revoked approval, use returned/event `trtc` credentials
   to re-enter as audience and disable the microphone.
5. On accepted host approval (`audio-room:seat-response`), use the returned
   `trtc` object to re-enter as an anchor.
6. Refresh credentials before `expiresAt` by calling `/trtc-token` again.

The portal supports both immediate seat taking and the optional
`seat-request`/`seat-response` host-approval flow. Product must choose which
experience is enabled in the Android UI.

Detailed references: [mobile-audio-room-api.md](mobile-audio-room-api.md) and
[mobile-socket-api.md](mobile-socket-api.md).

## Phase 6 — make the chat decision before implementation

The recovered application uses Tencent IM and its old `user_sig_im` flow. The
portal has a separate conversations/messages system delivered through REST and
Socket.IO. They are not interchangeable credentials or identity systems.

Choose exactly one approach:

1. **Portal chat:** Replace the relevant application chat screens with
   `/api/conversations`, `/api/conversations/:id/messages`, and Socket.IO
   `message:new` events.
2. **Tencent IM bridge:** Keep Tencent IM and build a secure portal service
   that provisions the corresponding IM identity and short-lived IM UserSig.

Do not attempt to use the portal session token or TRTC UserSig to sign in to
Tencent IM.

Detailed reference: [mobile-messaging-api.md](mobile-messaging-api.md).

## Phase 7 — migrate features by product priority

The legacy application has substantially more endpoint calls than the portal.
Migrate only approved product areas, one domain at a time, rather than pointing
the existing legacy client at the portal URL.

Portal mobile domains already available include:

- friends and requests
- posts/feed and uploads
- notifications
- rankings
- props/store and gifts
- wallet, top-ups, transfers, withdrawals, and transactions
- agencies and host applications

Use the matching documents in `docs/` as each domain is scheduled. Any legacy
screen without a portal endpoint needs an explicit product decision: build the
portal endpoint, retire the screen, or retain an independent legacy backend.

## Portal work needed before Android production release

Owner: portal/deployment team.

- Publish one stable HTTPS portal base URL and WSS Socket.IO endpoint for the
  Android production build.
- Set production environment values, including database, `AUTH_SECRET`, TRTC
  configuration, and a restricted `MOBILE_APP_ORIGIN`.
- Enable Tencent TRTC permission-key verification in the Tencent console.
- Provide staging credentials/test users and a two-device test plan.
- Add a versioned API changelog/OpenAPI document before distributing builds to
  external testers.
- Decide whether portal conversations replace Tencent IM or whether an IM
  bridge will be built.

## Acceptance checklist

- Android app can log in, securely store the portal session, and clear it when
  the portal invalidates it.
- A host can start one persistent audio room and discover it from another
  authenticated device.
- A listener can join, receive audience TRTC access, and hear room audio.
- A seated speaker receives new anchor TRTC access and can publish only after
  the seat operation succeeds.
- Seat leave, kick, room termination, device ban, and forced logout immediately
  disable the microphone and session as appropriate.
- No portal secret, static TRTC UserSig, legacy decryption secret, or cleartext
  API connection exists in the Android release build.
