# Mobile audio rooms: LiveKit contract

LiveKit is MegaLive's only audio/video media transport. Socket.IO remains the
authoritative channel for membership, seats, chat, gifts, reactions, and room
state. Prisma remains the source of truth for persisted state.

## Server configuration

```dotenv
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=server-only-api-key
LIVEKIT_API_SECRET=server-only-api-secret
LIVEKIT_TOKEN_TTL_SECONDS=600
```

For local development, `ws://localhost`, `ws://127.0.0.1`, and private-LAN
addresses are accepted. Production requires `wss://`. Never put the API key or
secret in an Android build.

## Obtain room access

```http
POST /api/v1/audio-rooms/livekit-token
Authorization: Bearer <portal-session-token>
Content-Type: application/json

{ "roomId": "ROOM-123" }
```

```json
{
  "success": true,
  "data": {
    "liveKit": {
      "url": "wss://livekit.example.com",
      "token": "opaque-jwt",
      "roomName": "ROOM-123",
      "userId": "USR-123",
      "canPublish": false,
      "expiresAt": "2026-09-28T12:10:00.000Z"
    }
  }
}
```

The owner and seated users receive publish permission. Listeners receive
subscribe-only access. Seat take, leave, kick, force-mute, invitation acceptance,
and bulk-clear operations update LiveKit publisher permissions on the server.
`audio-room:seat-status` also updates the connected LiveKit participant when a
seated user mutes or unmutes; Android must wait for its acknowledgement before
showing the microphone as enabled.
The relevant Socket.IO acknowledgements also return the refreshed `liveKit`
object when the client needs a new token.

Android should connect with the official LiveKit Android SDK, treat the token as
opaque, refresh it before `expiresAt`, publish the microphone only when
`canPublish` is true, and disconnect media when removed from the room.

## Local server requirement

The portal signs tokens but does not itself relay audio. `LIVEKIT_URL` must point
to a separately running LiveKit Server or LiveKit Cloud deployment. The HTTP
API/Socket.IO server can be healthy while media still fails if port 7880 is not
reachable from both the portal host and Android device.
