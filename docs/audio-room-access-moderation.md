# Room access and moderation hardening

## Authorization

Non-owner room managers cannot kick, ban, mute, deafen, move or unseat the owner or another delegated room role. Rejections use `ROOM_PERMISSION_DENIED`. Clear-all seats also refuses to bypass this protection.

Seat kick/lock/invite/force-mute, member deafen, member move and bulk-seat socket actions require the acting socket to have joined that room (`JOIN_ROOM_FIRST`). REST kicks require a currently present member or the owner.

Kicks and bans privately remove the target before broadcasting the refreshed seat state and member-left snapshot. No public kicked/banned announcement event is emitted by these REST operations.

## Access preflight

`GET /api/v1/audio-rooms/{roomId}/access`, Bearer authentication, 60 checks per user per minute.

Returns `{ success: true, data: { roomId, code } }`, where `code` is null or the current join restriction. Bans add `ban: { reason, expiresAt }` (null expiry is permanent). Paid rooms add `payment: { coins, admitted }`, scoped to the current room session. Expired restrictions are evaluated without modifying room records. This endpoint never joins, takes a seat, validates a supplied password or charges money. Successful preflight does not replace authorization at actual join time.

## Campaign requests

Contribution replay keys are scoped to internal user ID, public room ID and request ID. Matching retries replay the committed result; different amounts conflict. The room row is locked during the serializable transaction, with up to three attempts for serialization conflicts. Only fresh contributions broadcast progress.

## Music mix and room invitations

Both handlers are implemented. See [the complete mobile handoff](audio-room-tools-mobile-handoff.md) for payloads, playback responsibilities, inbox handling and rollout steps.

## Rollout verification

Restart the custom server after deployment. With owner A, delegated admins B/C and listener D, verify B cannot moderate A/C, disconnected B receives JOIN_ROOM_FIRST, and owner removal of D updates other devices without a public removal message. Verify paid, password, paused, banned, terminated and expired-restriction preflights. Send identical campaign request IDs from two users and ensure independent debits; retry one request and verify no additional debit.

Unit tests cover guards, access decisions, removal synchronization and retry-key isolation. Real multi-device/provider checks remain required.
