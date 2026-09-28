# Mobile audio-room API

## Persistent room identity

Each user can own exactly one audio-room ID. The backend assigns this ID and React Native must store/use the `roomId` returned by the API. Do not generate a room ID in the app.

When the room becomes empty, its Socket.IO runtime and live audio resource are released, while the database retains the assigned ID with status `IDLE`. Starting again reuses the same ID. Only an administrator's **Delete permanently** action removes that identity; the user's next start then receives a new ID.

All requests require `Authorization: Bearer <sessionToken>`.

## TRTC connection for JDAX Android

The portal now issues short-lived Tencent TRTC credentials from the server. Add
these server-only values to the portal deployment; never add the secret key to
the Android application:

```dotenv
TRTC_SDK_APP_ID=1400000000
TRTC_SECRET_KEY=your-trtc-secret-key
```

In the TRTC console, enable **permission key verification** for the application.
The portal returns a `privateMapKey` scoped to this room: listeners receive only
enter/receive-audio permissions and seated speakers receive create/enter/send/
receive-audio permissions.

After joining the portal Socket.IO room, request the matching TRTC credentials:

```http
POST /api/audio-rooms/trtc-token
Authorization: Bearer <sessionToken>
Content-Type: application/json

{ "roomId": "ROOM-7F30A921B8C4" }
```

```json
{
  "success": true,
  "data": {
    "sdkAppId": 1400000000,
    "userId": "USR-1048",
    "userSig": "...",
    "privateMapKey": "...",
    "strRoomId": "ROOM-7F30A921B8C4",
    "role": "audience",
    "appScene": "VOICE_CHATROOM",
    "canPublish": false,
    "expiresAt": "2026-08-28T12:00:00.000Z"
  }
}
```

For JDAX Android, use the native TRTC Android dependency—not this portal's
`trtc-sdk-v5` Web package—and pass the response directly into `TRTCParams`:

```kotlin
// app/build.gradle.kts
dependencies {
    implementation("com.tencent.liteav:LiteAVSDK_TRTC:latest.release")
}
```

```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

Request `RECORD_AUDIO` at runtime before a user takes a seat. All clients in an
audio room must use `TRTC_APP_SCENE_VOICE_CHATROOM`.

```kotlin
val trtc = response.data
val params = TRTCCloudDef.TRTCParams().apply {
    sdkAppId = trtc.sdkAppId
    userId = trtc.userId
    userSig = trtc.userSig
    privateMapKey = trtc.privateMapKey
    strRoomId = trtc.strRoomId
    role = if (trtc.canPublish) {
        TRTCCloudDef.TRTCRoleAnchor
    } else {
        TRTCCloudDef.TRTCRoleAudience
    }
}
trtcCloud.enterRoom(params, TRTCCloudDef.TRTC_APP_SCENE_VOICE_CHATROOM)
```

Call this endpoint again after `audio-room:seat-take`, `audio-room:seat-leave`,
`audio-room:seat-kicked`, or an accepted `audio-room:seat-response`; each event
now returns `data.trtc` when the role changes. Exit and re-enter TRTC with the
new credentials before changing microphone state. Refresh the token before
`expiresAt` by requesting `/trtc-token` again.

## LiveKit connection for Android

LiveKit is supported alongside TRTC. Configure these values only on the portal
server:

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_TOKEN_TTL_SECONDS=600
```

Android requests or refreshes a LiveKit token with:

```http
POST /api/v1/audio-rooms/livekit-token
Authorization: Bearer <sessionToken>
Content-Type: application/json

{ "roomId": "ROOM-7F30A921B8C4" }
```

The response contains `data.liveKit.url`, `token`, `roomName`, `userId`,
`canPublish`, and `expiresAt`. The token is bound to that portal user and room.
Listeners can subscribe only. The room owner and users with a persisted seat
can publish. Socket.IO join and role-transition acknowledgements also include
`liveKit` when LiveKit is configured. Refresh before `expiresAt`; never place
the LiveKit API key or secret in the Android application.

## Get the assigned room

`GET /api/audio-rooms`

Returns `data.room`, or `null` before the first room is created. `data.rooms` is retained as a compatibility array containing zero or one room.

## Create or start the room

`POST /api/audio-rooms`

```json
{
  "action": "START",
  "title": "Late Night Music Lounge",
  "liveAudioUrl": "https://media.example.com/live/stream.m3u8",
  "participantCount": 1
}
```

The first call returns HTTP `201`, assigns a system-generated ID, and sets `reused: false`. Later calls return HTTP `200`, reuse the assigned ID, and set `reused: true`.

```json
{
  "success": true,
  "data": {
    "roomId": "ROOM-7F30A921B8C4",
    "reused": true,
    "room": {
      "roomId": "ROOM-7F30A921B8C4",
      "status": "LIVE"
    }
  }
}
```

Any `roomId` sent by older app builds is ignored; the backend-owned ID is authoritative.

## Owner exits or ends the room

```json
{
  "action": "EXIT",
  "recordingUrl": "https://media.example.com/recordings/session.mp3"
}
```

`EXIT`, `EMPTY`, and `END` all change the room to `IDLE`, set participants to zero, clear the live-audio URL, preserve an optional recording URL, and retain the room ID.

The Socket.IO server also performs this automatically when the final socket leaves or disconnects. It emits `audio-room:idle` to the owner:

```json
{
  "success": true,
  "data": {
    "roomId": "ROOM-7F30A921B8C4",
    "status": "IDLE",
    "roomIdRetained": true
  }
}
```

## Room cover image

The room owner can upload a separate Party-card cover image after the room ID
has been assigned:

```http
POST /api/audio-rooms/cover
Authorization: Bearer <sessionToken>
Content-Type: multipart/form-data
```

Send the JPEG, PNG, or WebP file in the `image` form field. The maximum size
is 10 MB. The endpoint validates both the declared MIME type and the file's
binary signature.

```json
{
  "success": true,
  "data": {
    "coverImageUrl": "https://portal.example.com/api/audio-rooms/ROOM-7F30A921B8C4/cover"
  }
}
```

The owner's room responses and every Discover room entry include
`coverImageUrl`. It is `null` until a cover has been uploaded. This image is
only the Party/Discover card cover and does not replace the owner's profile
image or room background.

## Socket.IO

Join only after the START response:

```js
socket.emit("audio-room:join", { roomId: result.data.roomId }, callback);
socket.emit("audio-room:leave", { roomId: result.data.roomId }, callback);
```

The successful `audio-room:join` acknowledgement identifies the actual owner
and supplies the current room summary. Do not hardcode owner mode in the app.

```json
{
  "success": true,
  "data": {
    "roomId": "ROOM-7F30A921B8C4",
    "title": "Late Night Music Lounge",
    "participantCount": 12,
    "ownerId": "USR-1048",
    "isOwner": false
  }
}
```

## Server-authoritative live seats

Each room has 12 database-backed seats (`row0-seat1` through `row2-seat4`).
The server is the only source of seat occupancy, lock, note, mute, and speaking
state. Every successful change broadcasts the complete `audio-room:seat-update`
payload. Each occupant contains safe public identity plus resolved `frameUrl`
and `badgeUrl`; clients must replace their local snapshot with this payload.

The room join acknowledgement includes the same state as `data.seatState`.
Legacy client-emitted `audio-room:seat-update` snapshots are ignored and receive
the authoritative state in their acknowledgement.

The join acknowledgement's `data.owner` object contains both the permanent
`publicId` and resolved `displayId`. `displayId` is the owner's active Special
ID when one exists and has not expired; otherwise it equals `publicId`. Use
`publicId` for API identity and `displayId` only for presentation.

### Take a free seat

```js
socket.emit("audio-room:seat-take", {
  roomId: "ROOM-7F30A921B8C4",
  seatId: "row0-seat1"
}, callback);
```

The caller must already be in the live Socket.IO room. The operation atomically
clears any prior seat belonging to that user and assigns the free, unlocked
target. Success returns `{ seatId, seatState, trtc: { sdkAppId, userId,
userSig, privateMapKey, strRoomId, canPublish: true } }`. The client should
re-enter TRTC with those credentials before enabling its microphone.

### Move between seats

```js
socket.emit("audio-room:seat-move", {
  roomId: "ROOM-7F30A921B8C4",
  fromSeatId: "row0-seat1",
  toSeatId: "row1-seat3"
}, callback);
```

The source must belong to the caller and the target must be free and unlocked.
Both writes happen in one serializable database transaction, so no duplicate or
temporary seat is exposed.

### Leave a seat

```js
socket.emit("audio-room:seat-leave", {
  roomId: "ROOM-7F30A921B8C4",
  seatId: "row1-seat3"
}, callback);
```

This clears the persisted seat, revokes TRTC audio-upstream permission,
broadcasts the new state, and returns subscribe-only credentials in
`data.trtc` (the owner remains publish-capable).

### Mute and speaking state

```js
socket.emit("audio-room:seat-status", {
  roomId: "ROOM-7F30A921B8C4",
  muted: false,
  speaking: true
}, callback);
```

Only a seated caller can update its status. `speaking` is forced to false while
muted.

### Owner seat management

The owner can lock/unlock a seat and optionally update its note:

```js
socket.emit("audio-room:seat-lock", {
  roomId: "ROOM-7F30A921B8C4",
  seatId: "row2-seat4",
  locked: true,
  note: "Reserved"
}, callback);
```

When a smaller visual layout removes an occupied real seat, the owner can
vacate only that seat:

```js
socket.emit("audio-room:seat-kick", {
  roomId: "ROOM-7F30A921B8C4",
  seatId: "row2-seat4"
}, callback);
```

The affected user remains connected to the audio room as a spectator. The
server clears their persisted seat, revokes active microphone publishing,
broadcasts the complete updated seat state, and emits
`audio-room:seat-kicked` directly to that user with subscribe-only
`data.trtc` credentials. Their client should re-enter with these credentials
and disable its microphone; it must not navigate out of the room.

The older `seat-request`/`seat-response` approval flow remains supported for
products that explicitly enable host approval. Normal seat taking and switching
uses `seat-take`/`seat-move` without owner approval.

`POST /api/audio-rooms/trtc-token` independently checks the persisted seat:
the owner or a seated user gets `canPublish: true`; every other authenticated
participant gets subscribe-only TRTC credentials. Seat records are also cleared
on socket leave/disconnect and when a room ends or becomes empty.

Listen for administrator and lifecycle events:

- `audio-room:idle`
- `audio-room:joining-disabled`
- `audio-room:blocked`
- `audio-room:terminated`
- `audio-room:deleted`

Current moderation behavior:

- `audio-room:joining-disabled`: only the room owner may join until `expiresAt`. Other users receive `ROOM_OWNER_ONLY` from the Socket.IO join callback.
- `audio-room:joining-enabled`: owner-only mode was manually removed or its timer expired.
- `audio-room:blocked`: nobody, including the owner, may start or join until `expiresAt`.
- `audio-room:unblocked`: the timed block was manually removed or expired.
- `audio-room:terminated`: the current room is unavailable to everyone until `expiresAt`.
- `audio-room:restored`: termination was manually removed or expired. The room returns to `IDLE` and the owner can start it again.

Audio recording playback and permanent room deletion are currently disabled in the admin portal. The database fields and lifecycle event remain available for later re-enabling.

After `audio-room:deleted`, discard the old ID locally. The next `START` request creates and returns a new persistent ID.

## Discover live rooms

Use this endpoint for the mobile app's Trending Parties list.

```http
GET /api/audio-rooms/discover
Authorization: Bearer <sessionToken>
```

It returns up to 50 currently live rooms, ordered by participant count and then
start time. The caller's own room, blocked rooms, rooms with joining disabled,
and rooms owned by unavailable accounts are excluded.

```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        "roomId": "ROOM-7F30A921B8C4",
        "title": "Late Night Music Lounge",
        "coverImageUrl": "https://portal.example.com/api/audio-rooms/ROOM-7F30A921B8C4/cover",
        "participantCount": 12,
        "startedAt": "2026-07-22T08:00:00.000Z",
        "owner": {
          "id": "USR-1048",
          "name": "Aisha Khan",
          "profileImage": null
        }
      }
    ]
  }
}
```

An invalid or expired token returns HTTP `401` with the error code
`INVALID_SESSION`.
# Room chat history and recovery

`GET /api/v1/audio-rooms/{roomId}/messages?limit=30&cursor=...` requires the
mobile bearer token and returns `{ roomId, chatRevision, retentionDays,
nextCursor, messages }`. The cursor is opaque and must not be constructed by
the client. The same first-page object is returned as `chatHistory` by the
`audio-room:join` acknowledgement for reconnect recovery.

Send with `audio-room:message` and `{ roomId, body, requestId }`. `requestId`
is a client-generated stable value (maximum 100 characters). Reusing it for
the same account and room acknowledges the stored message with
`duplicate: true` without a second room broadcast.

`audio-room:clear-chat` advances the canonical `chatRevision`; it does not
delete prior records. Clients receiving `audio-room:chat-cleared` must discard
messages from older revisions. Member-visible history is 30 days.
