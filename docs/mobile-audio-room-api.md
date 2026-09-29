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

## Room music from Android local storage

Music files remain entirely on the Android device. The portal never receives a
file, local URI, filesystem path, or playable music URL. The room owner first
joins the Socket.IO audio room and then requests a separate publish-only LiveKit
identity:

```http
POST /api/v1/audio-rooms/ROOM-123/music-token
Authorization: Bearer <portal-session-token>
```

The response contains `data.liveKitMusic` with `url`, `token`, `roomName`,
`publisherId`, `canPublish`, `canSubscribe`, `source`, and `expiresAt`. The
identity is `MUSIC-{ownerPublicId}`, cannot subscribe, and must be used only for
the audio track decoded from the owner's local music file. The regular user
identity continues carrying microphone audio.

Only a connected user with `canManageMusic` can obtain this token or control
the canonical state. Current permissions grant this to the room owner. Socket
actions are:

- `audio-room:music-play`: `{ roomId, requestId?, localTrackId?, title, artist?, durationSeconds, positionSeconds? }`
- `audio-room:music-pause`: `{ roomId, requestId? }`
- `audio-room:music-seek`: `{ roomId, requestId?, positionSeconds }`
- `audio-room:music-stop`: `{ roomId, requestId? }`

Every successful action acknowledges and broadcasts
`audio-room:music-changed`. Its data contains `roomId`, metadata, `status`,
`positionSeconds`, `startedAt`, `publisherId`, `revision`, `updatedAt`, and
`changedBy`. It never contains a local path or media URL. The join
acknowledgement returns the same canonical object as `musicState`, allowing a
reconnecting client to restore its controls. On stop, the server also removes
the dedicated LiveKit music participant.

Listeners hear the published LiveKit track directly; they must not try to open
the owner's `localTrackId`. That value is only an opaque UI/library identifier.

For portal catalogue music, authenticated clients obtain tracks from
`GET /api/music/catalog`. A catalogue play request sends `source: "CATALOG"`
and the raw `catalogTrackId`; it must not send or choose `trackUrl`. The server
looks up an active global `MUSIC_TRACKS` asset and generates a signed streaming
URL. Both `audio-room:music-changed` and the join `musicState` then contain that
server-generated `trackUrl`, allowing every participant to play the same file
from `positionSeconds`/`startedAt`. For `source: "LOCAL"` (and omitted source),
`trackUrl` is always null and the dedicated LiveKit publisher remains required.

## Local server requirement

The portal signs tokens but does not itself relay audio. `LIVEKIT_URL` must point
to a separately running LiveKit Server or LiveKit Cloud deployment. The HTTP
API/Socket.IO server can be healthy while media still fails if port 7880 is not
reachable from both the portal host and Android device.
