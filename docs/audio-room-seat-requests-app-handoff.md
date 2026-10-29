# Persisted audio-room seat requests

Implementation is local. Migration, deployment and two-phone/provider verification
are pending. No production records or balances were changed.

## Request and recovery

`audio-room:seat-request`: `{roomId, seatId?, note?}`. The requester must currently
be in the room, active, unbanned and not already seated. Owner requests are rejected.
The server issues `requestId` and `expiresAt` (60 seconds). Repeating a pending
request for the same seat returns the same request; a different seat returns
`SEAT_REQUEST_PENDING`. At most five new requests per user per minute.

Pending lists: `GET /api/v1/audio-rooms/{roomId}/seat-requests?limit=30&cursor=...`
(legacy `/api/audio-rooms/...` also exists), or socket `audio-room:seat-requests`
with `{roomId,limit?,cursor?}`. Only present owner/admins with `canManageSeats`
can read it. Response data: `{roomId,items,nextCursor,serverTime}`. Maximum limit
100; follow the opaque cursor. Refetch on reconnect and replace the local list;
do not assume locally retained items are still pending. Requests may expire while
paging. Responses are no-store and require existing mobile authentication.

## Approve or deny

Send `audio-room:seat-response` with `{roomId,requestId,accepted:true|false,reason?}`.
Legacy `requesterId` and `seatId` fields, if supplied, must exactly match the stored
request. For an unspecified seat, omit seatId; the server chooses the first free
audience seat in layout order. Approval now directly assigns that requested seat,
including a locked seat, without globally unlocking it. **Do not also send an
invitation for the same approval.** Explicit invitations remain a separate flow.

The owner or an authorized present admin may act. Admins cannot act on peer admins
or the owner. The stored request, account status, presence, bans, current role,
layout and occupancy are validated again in a Serializable transaction. Seat
assignment and request resolution commit together. A competing moderator or replay
gets `SEAT_REQUEST_RESOLVED`; an occupied seat leaves the request pending.
Forced mute is preserved. Admission does not turn on the microphone automatically.

## Events and credentials

Creation uses the existing `audio-room:seat-request`; resolution uses
`audio-room:seat-response`. Only currently eligible moderators receive requester
details; the requester receives its resolution. No room-wide request-detail event.

Common data:
```json
{
  "requestId":"server-uuid", "roomId":"ROOM-1", "requesterId":"USR-123",
  "requesterName":"Example", "requesterProfileImage":null,
  "seatId":"row0-seat1", "status":"APPROVED", "accepted":true,
  "requestedAt":"2026-10-29T12:00:00.000Z",
  "expiresAt":"2026-10-29T12:01:00.000Z",
  "respondedAt":"2026-10-29T12:00:20.000Z",
  "actorId":"USR-OWNER", "note":null, "reason":null,
  "eventId":"seat-request:server-uuid:APPROVED"
}
```

Statuses: PENDING, APPROVED, DENIED, CANCELLED, EXPIRED. Deduplicate by eventId;
acknowledgements and socket delivery may both contain the same resolution.
Only the requester's resolution contains `trtc`/`liveKit` and seatState. Moderators
never receive those credentials. RTC refresh failure after admission does not undo
approval: requester gets `rtcRefreshRequired:true` plus credentials-invalidated,
and uses the existing RTC-token refresh. Provider/real-device behavior needs testing.

Explicit leave and switching rooms cancel pending requests. Transient disconnect
does not extend the 60-second request lifetime; while disconnected approval is
denied. Closed/blocked rooms and expired requests are resolved by a one-second
worker. Status records remain for recovery/history; no prior records are deleted.
The worker claims each resolution for one notifier. Network delivery is best-effort;
reconnect recovery is authoritative, not an exactly-once socket guarantee.

Expected errors include VALIDATION_ERROR, ROOM_UNAVAILABLE, JOIN_ROOM_FIRST,
ROOM_PERMISSION_DENIED, PROTECTED_ROOM_MEMBER, VIEWER_REQUIRED, ALREADY_SEATED,
SEAT_REQUEST_PENDING, SEAT_REQUEST_NOT_FOUND, SEAT_REQUEST_MISMATCH,
SEAT_REQUEST_EXPIRED, SEAT_REQUEST_RESOLVED, SEAT_NOT_FOUND, SEAT_OCCUPIED,
RATE_LIMITED. Unexpected errors use stable SEAT_REQUEST_FAILED,
SEAT_RESPONSE_FAILED or SEAT_REQUEST_LIST_FAILED without internal exception text.

Deploy migration `20261029120000_audio_room_seat_requests`, regenerate Prisma,
rebuild and restart before switching the app from approve-and-invite to direct
approval. Verify two moderators racing, locked/occupied/owner seats, permission
revocation, reconnect, expiry, switch, ban and credential privacy on dedicated QA
accounts. Existing invitation paths were not rewritten by this change.
