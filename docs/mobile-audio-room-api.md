# Mobile audio-room API

## Persistent room identity

Each user can own exactly one audio-room ID. The backend assigns this ID and React Native must store/use the `roomId` returned by the API. Do not generate a room ID in the app.

When the room becomes empty, its Socket.IO runtime and live audio resource are released, while the database retains the assigned ID with status `IDLE`. Starting again reuses the same ID. Only an administrator's **Delete permanently** action removes that identity; the user's next start then receives a new ID.

All requests require `Authorization: Bearer <sessionToken>`.

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

## Live seat-state relay

Seat state is intentionally ephemeral. The owner remains the source of truth;
the server validates ownership and relays changes without writing them to the
database.

Owner broadcasts the complete current state after every seat or note change:

```js
socket.emit("audio-room:seat-update", {
  roomId,
  seatRows,
  notes
}, callback);
```

Viewers listen for `audio-room:seat-update` and replace their local `seatRows`
and `notes` with `payload.data`. A non-owner attempting to emit this event gets
`OWNER_REQUIRED`. The sender must have joined the room first.

When a viewer joins, the owner receives `audio-room:seat-sync-request` with
`requesterId` and should immediately broadcast its current complete seat state.
This gives newly joined viewers a snapshot without backend persistence.

To request a seat, a viewer emits:

```js
socket.emit("audio-room:seat-request", {
  roomId,
  seatId,
  note
}, callback);
```

The owner receives `audio-room:seat-request`. Its payload contains the
server-generated `requestId`, authenticated `requesterId`, trusted
`requesterName`, optional `requesterProfileImage`, requested `seatId`, and
optional note:

```json
{
  "success": true,
  "data": {
    "requestId": "b28ac63d-7b82-48e8-967f-e27f62d197c7",
    "roomId": "ROOM-7F30A921B8C4",
    "requesterId": "USR-2048",
    "requesterName": "Aisha Khan",
    "requesterProfileImage": null,
    "seatId": "row0-seat1",
    "note": null,
    "requestedAt": "2026-07-23T08:00:00.000Z"
  }
}
```

The owner accepts or rejects it with:

```js
socket.emit("audio-room:seat-response", {
  roomId,
  requestId,
  requesterId,
  seatId,
  accepted: true,
  reason: null
}, callback);
```

The requester receives `audio-room:seat-response`. Only the verified room owner
can respond, and the requester must still be connected to that audio room. On
acceptance, the owner should update its own state and then emit the complete
`audio-room:seat-update` snapshot to all viewers.

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
