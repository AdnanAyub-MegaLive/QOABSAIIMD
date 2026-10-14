# Audio Room Tools — Mobile Handoff

Date: 2026-10-14
Scope: room admin hierarchy, joined moderation, kick synchronization, campaign request IDs, access preflight, music mix and room invitations.
Status: implemented locally; production deployment and real-device QA required.

## 1. Authentication and response conventions

Connect Socket.IO with `auth: { token: sessionToken }`. Existing session/device/ban validation applies to every action. REST calls use `Authorization: Bearer <sessionToken>`. Identity comes from the authenticated session, never an actor ID in a request.

Socket acknowledgements and broadcasts use `{ success: true, data: {...} }` or `{ success: false, error: { code, message } }`. Supply an acknowledgement callback and a bounded client timeout. A timeout is not proof that an operation failed to commit.

## 2. Room roles, not platform-management roles

This hierarchy is based on the room owner and `AudioRoomRole`, not BD/Admin/Country Head platform titles.

| Operation | Owner | Delegated room admin | Ordinary member |
| --- | --- | --- | --- |
| Moderate ordinary members | Yes | Yes | No |
| Moderate owner or another delegated room role | Owner authority, subject to existing self-action rules | No | No |
| Manage seats/chat/privacy | Yes | Yes | No |
| Play/pause/seek/stop/skip catalog music | Yes | Yes | No |
| Upload/delete owner music catalog | Yes | No | No |
| Assign/remove room admins | Yes | No | No |
| Set owner music/mic mix | Yes | No | No |
| Invite a user into the room | Yes | Yes | No |

Continue rendering controls from join `permissions` and `audio-room:permissions-changed`. For the new mix button additionally require `isOwner`. For invitations use `canManageSeats`. Backend authorization remains mandatory regardless of button visibility.

Hierarchy rejection: `ROOM_PERMISSION_DENIED`. Protected paths: REST kicks and blacklist, socket `seat-kick`, `seat-force-mute`, `member-force-deafen`, `seat-move-member`. Admin CLEAR_ALL also fails if it would remove a protected occupant; it does not silently skip them.

The acting socket must be joined for `seat-kick`, `seat-lock`, `seat-invite`, `seat-force-mute`, `member-force-deafen`, `seat-move-member`, `seats-bulk`, mix and room invitations. Otherwise `JOIN_ROOM_FIRST`. REST kicks require actor presence (`socketCount > 0`) unless the actor owns the room.

## 3. Kick/ban synchronization: no public removal announcement

After REST kick/ban commits, the target receives private `audio-room:removed` and leaves the channel. Remaining participants receive canonical `audio-room:seat-update` and:

```json
{ "success": true, "data": { "roomId": "ROOM-1", "revision": 24, "total": 3, "userId": "USR-2" } }
```

The latter is `audio-room:member-left`. Update member list, viewer count and seats. Do not generate a public "kicked" chat line. These REST paths deliberately do not broadcast `audio-room:member-banned` with `kicked: true`. The removed user's private error remains visible to that user only. Member revisions and seat revisions are separate streams; do not compare them to one another.

## 4. Side-effect-free access preflight

`GET /api/v1/audio-rooms/{roomId}/access`, 60 requests/minute/user.

```json
{ "success": true, "data": { "roomId": "ROOM-1", "code": null } }
```

Restricted cases return success envelopes with non-null `data.code`: `ROOM_BANNED`, `ROOM_BLOCKED`, `ROOM_TERMINATED`, `ROOM_UNAVAILABLE`, `ROOM_OWNER_ONLY`, `ROOM_PASSWORD_REQUIRED`, `ROOM_PAYMENT_REQUIRED`.

```json
{ "success": true, "data": { "roomId": "ROOM-1", "code": "ROOM_BANNED", "ban": { "reason": "Room restriction", "expiresAt": "2026-10-14T15:00:00.000Z" } } }
```

Permanent bans use `expiresAt: null`. Only banned responses include `ban`. Paid rooms include `payment: { coins: "100", admitted: false }`; admission is scoped to the current room session. Present the password/payment prompt as appropriate, but do not treat preflight as authorization: actual join rechecks all rules. This endpoint accepts no password and never joins, takes a seat or charges coins. HTTP auth errors and 429 remain ordinary error envelopes. Respect Retry-After.

## 5. Campaign contribution replay

`POST /api/v1/audio-rooms/{roomId}/campaign/contribute` retains `{ coins, requestId }`. The replay key is scoped to authenticated user and room. Two different users using the same request ID are independent contributions. A same-user/room retry with the same amount replays; a changed amount returns `IDEMPOTENCY_CONFLICT`. Replays do not broadcast progress again. Generate a fresh ID for each intentional contribution, and reuse it only for that action's retry.

## 6. Owner mix settings

Send `audio-room:mix-set`:

```json
{ "roomId": "ROOM-1", "musicVolume": 40, "micVolume": 80 }
```

Both volume fields are integer percentages 0–100; at least one is required. Omitted fields retain their previous values. Defaults are 100/100. Owner must be joined. Maximum 60 requests/minute/user; debounce sliders and submit on release instead of every animation frame.

Acknowledgement and room-wide `audio-room:mix-changed`:

```json
{ "success": true, "data": { "roomId": "ROOM-1", "musicVolume": 40, "micVolume": 80, "revision": 2, "changed": true, "changedBy": { "publicId": "USR-1" }, "updatedAt": "2026-10-14T12:00:00.000Z" } }
```

Unchanged values acknowledge `changed: false` without writing or broadcasting. Join/reconnect includes `data.mixState` with the same saved volume/revision fields (no roomId or changed flag). With no saved settings it is `{ musicVolume: 100, micVolume: 100, revision: 0 }`. Mix revision is independent of seats/settings/member revisions. Ignore older revisions and apply the join snapshot.

### Mobile playback responsibility

- All participants apply musicVolume to their synchronized catalog music player (percentage divided by 100 for a 0–1 API).
- Only the owner applies micVolume to their own microphone capture gain. Other participants must not change their microphones or multiply the owner's remote gain again.
- Volume zero is gain zero, not a permission grant/revoke. Never unmute, take a seat, reconnect RTC, request credentials or override force-mute/deafen as a consequence of a mix event.
- This is control-state synchronization, not server-side PCM mixing. The app must implement the gain changes; no backend code alone can change a device player's volume.
- TRTC/LiveKit provider selection is unchanged. Neither handler calls an RTC provider.

Errors: `VALIDATION_ERROR`, `JOIN_ROOM_FIRST`, `ROOM_PERMISSION_DENIED`, `ROOM_UNAVAILABLE`, `RATE_LIMITED`, `ROOM_ACTION_FAILED`.

## 7. Invite someone into a room

Send `audio-room:room-invite`:

```json
{ "roomId": "ROOM-1", "userId": "USR-2", "requestId": "invite-unique-id-123" }
```

`userId` is the recipient's canonical public ID (not a client-supplied actor or special display ID). `requestId` is required: 1–64 letters, digits, underscores or hyphens. Joined owner or delegated admin only, 20 attempts/minute/user. The recipient must be active, not deleted, not account/room banned, and not blocked in either direction. Self-invites are rejected. Invites never reveal passwords or grant free paid admission.

Sender acknowledgement; recipient receives `audio-room:room-invited` with the same envelope:

```json
{ "success": true, "data": {
  "invitationId": "NOT-...", "requestId": "invite-unique-id-123",
  "screen": "AUDIO_ROOM", "roomId": "ROOM-1", "title": "My Room", "userId": "USR-2",
  "inviter": { "publicId": "USR-1", "name": "Owner", "profileImage": null },
  "expiresAt": "2026-10-14T12:05:00.000Z", "duplicate": false
} }
```

Invitations expire after five minutes. A same sender/room/recipient/request retry returns the original invitation with `duplicate: true`, without sending another immediate event or adding an inbox row. Reusing a request ID for a different recipient is a different invitation; the app should still use a fresh request ID per action.

The existing notification inbox also stores type `ROOM_INVITATION`. The regular `notification:new` event uses the existing raw notification DTO (not a socket envelope), with `id` equal to invitationId and `action` containing the navigation/inviter/expiry fields. Deduplicate immediate invitation and inbox notifications by this ID. This is in-app delivery only, no FCM/push.

Accept means the user chooses to open the room: first call access preflight, then follow the normal password/payment/join flow. Decline dismisses the card; no invitation-response endpoint, auto-join or seat assignment is involved. Disable expired invitation actions; users can independently find an accessible room through normal discovery. Inbox entries remain history after expiry and are not reusable access tokens.

Errors include `ROOM_INVITATION_UNAVAILABLE` (generic recipient refusal, without disclosing private ban/block details), plus the common errors listed for mix. A successful ack confirms storage, not that the recipient saw it. Reconnect recovers via the notification inbox, not invitation event replay.

## 8. Deployment and QA

New additive migration: `20261014160000_room_audio_mix` adds nullable JSON `AudioRoomEntertainmentState.mix`. No existing media, wallet or membership data is removed.

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart megalive-portal --update-env
```

Deploy only after pulling the intended committed version; these instructions do not mean production has been deployed. Restart is required because server.js socket handlers are not hot-reloaded.

Test with owner A, admin B, admin C and listener D: hierarchy protection, departed-admin rejection, silent removal synchronization, same campaign ID across two users, timed/permanent ban preflight, paid admission preflight. Test mix changes on two phones, owner-only capture gain, force-muted owner remaining muted, unchanged values, slider throttling and reconnect snapshots. Test invitation blocks/bans, admin authorization, retry deduplication, expiry, inbox duplication suppression and password/paid-room prompts. Real-device audio verification is required before release.
