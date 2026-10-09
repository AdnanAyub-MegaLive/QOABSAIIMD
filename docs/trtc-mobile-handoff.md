# Tencent RTC mobile handoff

Date: 2026-10-09. SDKAppID: **20044231**.

## Rollout status

The portal now supports TRTC credential issuance and an explicit RTC_PROVIDER
switch. Local configuration selects TRTC. LiveKit code, dependency, endpoints
and existing environment values are retained; token issuance is disabled while
TRTC is selected. This is not a verified deployment or an app SDK migration.

Before testing, the operator must:

1. Enable **Advanced Permission Control** for this exact SDKAppID in Tencent's
   console, then set TRTC_ADVANCED_PERMISSION_ENABLED=true on the backend.
2. Supply TENCENT_CLOUD_SECRET_ID and TENCENT_CLOUD_SECRET_KEY server-side, with
   least-privilege access to TRTC RemoveUserByStrRoomId. These are NOT the SDK
   signing key. TRTC_REGION defaults to ap-singapore; verify the account region.
3. Restart node server.js; coordinate the mobile release and drain existing
   LiveKit sessions. Changing the portal provider does not stop an already
   running LiveKit service or disconnect its previously issued sessions.
4. Test the cases below before a production switch. No Tencent console settings
   or running media service were changed by this source update.

Tickets fail closed while console confirmation or cloud credentials are missing.
The provided SDK secret is in ignored .env.local, never this document or the APK.
Rotate a secret shared in chat before production and update only the backend.

## What stays unchanged

Portal Bearer authentication, Google login, Socket.IO authentication, room IDs,
seats, gifts, chat, presence and music catalogue protocols remain portal-owned.
Do not introduce Tencent IM. Socket.IO still uses auth: { token: sessionToken }.
RTC is only the audio/video transport; it does not replace the portal session.

## Audio room flow

1. Authenticate Socket.IO and emit audio-room:join with the existing roomId,
   plus password when required. Password, paid admission and ban checks remain.
2. Successful join acknowledgement contains data.rtcProvider, data.trtc and
   data.liveKit. With TRTC selected, liveKit is null. Use the trtc object.
3. Initial permissions and refresh credentials are available through:

   POST /api/v1/audio-rooms/rtc-token
   Authorization: Bearer <portal-session-token>
   Content-Type: application/json
   { "roomId": "ROOM-123" }

   Legacy path /api/audio-rooms/rtc-token is also available.
   A current authenticated Socket.IO membership is REQUIRED; merely knowing a
   room ID does not bypass the join checks. Both LIVE and IDLE rooms remain
   joinable under the existing product policy.

Response (illustrative; signatures redacted):

```json
{
  "success": true,
  "data": {
    "rtcProvider": "TRTC",
    "liveKit": null,
    "trtc": {
      "provider": "TRTC",
      "sdkAppId": 20044231,
      "userId": "USR-123",
      "strRoomId": "ROOM-123",
      "userSig": "<server-issued>",
      "privateMapKey": "<server-issued>",
      "role": "AUDIENCE",
      "appScene": "VOICE_CHATROOM",
      "canPublish": false,
      "expiresAt": "<ISO-8601 UTC>"
    }
  }
}
```

Use string-room mode, not a numeric room ID derived by stripping ROOM-.
Map appScene and role to the installed Tencent SDK's constants. Set userId,
userSig, strRoomId and privateMapKey from this response unchanged. The backend
permits owner publishing; participant publishing requires a current unmuted,
non-force-muted seat. Audio tickets never grant video/screen-share publishing.

Seat-take, seat-leave, seat-kicked, accepted invitation acknowledgement and
seat-response now also use rtcProvider/trtc/liveKit fields. A freshly occupied
seat starts muted under existing rules: unmute through the server first, then
fetch the resulting publisher credentials. Never infer publishing from UI alone.
Inviters do not receive the invitee's RTC credentials.

## Live video

Keep the live lifecycle and live-video:join Socket.IO flow. After joining:

POST /api/v1/live-video/{liveId}/rtc-token
Authorization: Bearer <portal-session-token>

The response is data: { liveId, rtcProvider, liveKit, trtc }, using the same trtc
shape. strRoomId is video-<liveId>, appScene is LIVE. Host KYC remains mandatory.
Only the host and approved guests receive audio/video publishing permission.
Viewers receive subscribe-only tickets. Bans and active live state are checked.
Do not call the old livekit-token endpoints for TRTC or pass UserSig to LiveKit.

## Renewal, permission changes and teardown

Default ticket lifetime is 300 seconds (server-configurable 60–600). Use the
returned expiresAt; schedule refresh ahead of expiry and handle SDK expiry and
role-switch callbacks. SDK-specific role changes must include the fresh
privateMapKey. If the installed bridge cannot update a ticket in place, exit
and re-enter using a fresh credential response. Do not log/cache tickets on disk.

New private event:

```json
{
  "success": true,
  "data": { "provider": "TRTC", "roomId": "ROOM-123", "reconnect": true }
}
```

Event name: rtc:credentials-invalidated. For live video roomId is video-<liveId>.
Fetch fresh credentials. reconnect=true means stop publishing and exit/re-enter
TRTC, while retaining Socket.IO membership unless a room/session removal event
also occurs. On downgrade the backend invokes Tencent removal because there is
no direct LiveKit updateParticipant equivalent in this adapter. On promotion
reconnect=false indicates refresh and switchRole as supported by the SDK.
Existing force-muted, seat-moved, seat-kicked, room-ended, removed and session
revocation events still apply. Exit TRTC immediately on room leave/end or logout;
do not automatically reconnect after a ban or revoked session.

Important security limitation: issuing a newer ticket does not revoke a prior
ticket. Removal is not a permanent ban on reuse of an unexpired credential, and
expiry does not itself guarantee teardown of an established media session.
The adapter does not implement continuous Tencent media membership reconciliation
or a durable retry queue for removal failures. Cloud removal failures are logged;
strict adversarial-client revocation and room-end/session-revocation teardown
must be validated/hardened before production. Do not claim full immediate
server-enforced revocation solely from privateMapKey or a client event.

## Errors

Standard success:false,error:{code,message} envelope. Versioned REST routes keep
X-Request-Id, X-API-Version and no-store headers.

| Code | REST status | Action |
| --- | --- | --- |
| RTC_ROOM_JOIN_REQUIRED | 403 | Authenticate/join Socket.IO room first |
| RTC_PROVIDER_DISABLED | 409 | Use the active provider's rtc-token contract |
| TRTC_NOT_CONFIGURED | 503 | Backend configuration required |
| TRTC_PERMISSION_SETUP_REQUIRED | 503 | Operator must enable/confirm permission control |
| TRTC_CLOUD_NOT_CONFIGURED | 503 | Operator must add cloud moderation credentials |
| RTC_MODERATION_FAILED | 503 | Retry action; do not report enforcement success |

Existing session/ban/resource errors remain unchanged. Some legacy socket
handlers retain their operation-specific error codes; do not depend on the REST
configuration code appearing unchanged in every Socket.IO acknowledgement.

## Music and rollback

Catalogue music remains independently streamed from signed portal URLs; its
synchronization is not replaced by TRTC. The legacy LiveKit music-token route
is disabled in TRTC mode. Native local-file broadcast/mixing needs a separate
Tencent mobile implementation; this update does not build that feature.

To roll back: drain TRTC sessions, set RTC_PROVIDER=LIVEKIT, keep the saved
LIVEKIT_* values, restart the portal and select LiveKit in the mobile adapter.
TRTC and LiveKit clients do not hear each other in the same portal room.

## Acceptance tests for the app developer and operator

- Owner plus two listeners on different networks hear each other after seat
  take/unmute, and audience tickets cannot publish.
- Force mute, unmute, seat kick, room ban, guest approve/remove and room end.
- Password and paid rooms cannot be entered through rtc-token without socket join.
- Credential refresh, foreground/background, reconnect and expired sessions.
- Live host KYC, viewer subscribe-only and all four guest slots.
- Failed Tencent removal, replayed old publisher ticket and forced logout.
- LiveKit rollback, catalogue music, and no secrets/tickets in APK/logs.

References: [Tencent advanced permissions](https://trtc.io/document/35157),
[Tencent removal API](https://www.tencentcloud.com/zh/document/product/647/39630),
[Tencent server signing library](https://github.com/tencentyun/tls-sig-api-v2-node).
