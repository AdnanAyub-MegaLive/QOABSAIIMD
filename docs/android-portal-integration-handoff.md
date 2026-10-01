# Android–Portal integration handoff

## Boundaries

- Portal HTTPS APIs provide authentication, profiles, discovery, history, store,
  wallet, gifts, and persisted room state.
- Authenticated Socket.IO provides membership, seats, room chat, reactions,
  moderation, and live state changes.
- LiveKit provides audio/video transport only.
- Android must never contain `AUTH_SECRET`, `LIVEKIT_API_SECRET`, database
  credentials, or private signing material.

## Authentication

Send the portal session as `Authorization: Bearer <token>` for REST and as
`auth: { token }` during the Socket.IO handshake. Treat tokens and all public IDs
as opaque strings. Respect `expiresAt`; clear local identity on
`SESSION_REVOKED`, forced logout, device ban, or account ban.

## Audio-room sequence

1. Fetch discovery/search and select a room.
2. Connect authenticated Socket.IO.
3. Emit `audio-room:join` and wait for its acknowledgement.
4. Request `POST /api/v1/audio-rooms/livekit-token` with `{ "roomId": "..." }`.
5. Join the returned `roomName` using the returned LiveKit `url` and `token`.
6. Publish the microphone only when `canPublish` is true.
7. Apply Socket.IO seat, mute, kick, background, chat, gift, and moderation
   events as the authoritative room state.
8. Refresh LiveKit access before `expiresAt` and leave LiveKit when leaving the
   Socket.IO room.

Seat acknowledgements may contain a refreshed `liveKit` object. Use it directly;
do not derive media permissions on-device.

## Messaging

Portal conversations and room-local chat use Socket.IO plus Prisma persistence.
Use the versioned REST history/sync endpoints for reconnect recovery. Do not use
a media credential as a messaging or portal session credential.

## Production checklist

- HTTPS/WSS portal base URL is reachable by Android.
- LiveKit uses a trusted `wss://` endpoint reachable by portal and Android.
- Socket.IO proxy upgrades are enabled.
- One owner and two listener accounts pass join/seat/mute/kick/reconnect tests.
- Ban, revoked-session, device mismatch, and token-expiry behavior is verified.
- The deployed API version and mobile contract are recorded in the release.

See [mobile audio room API](mobile-audio-room-api.md),
[mobile API v1](mobile-api-v1.md), and
[production deployment](mobile-production-deployment.md).
