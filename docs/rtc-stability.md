# Audio RTC stability changes

Speaking-only `audio-room:seat-status` must omit `muted`. Omitted mute state is
preserved; values must be booleans. These updates never call provider permission
changes. Explicit mic updates retry failed provider operations; successfully
applied repeated permissions are coalesced in a process-local serialized gate.
Moderator/seat removals retain their provider calls. Failed provider calls return
an error rather than success and are not marked applied. Promotion for audio
rooms rechecks membership, room state, seat mute/force-mute and room bans.

Duplicate concurrent joins on the same socket share one operation/ack result.
Presence registration derives socketCount from current authenticated sockets.
Transport reconnects within 60 seconds suppress entrance effects for the same
user/session version; intentional leave clears that marker. This recovery marker
is process-local and does not survive a restart. Failed first joins leave the
channel and attempt presence cleanup. Existing presence maintenance remains.

TRTC access revalidates room access before reusing an unexpired ticket with the
same effective permission (renewal window: 30 seconds). Credential HTTP requests
are limited to 30/minute per authenticated user, not per shared network IP, on
both legacy and v1 endpoints. LiveKit remains preserved and provider-selected.

## Release verification still required

Run owner/listener/force-muted/banned accounts on real devices. Confirm speaking
does not reconnect audio, explicit mute updates change publishing, and retries
after Tencent API failures cannot report successful moderation prematurely.

The permission gate, ticket cache and entrance recovery are single-process
optimizations, not a distributed durable reconciliation system. Multi-worker
deployment requires shared state. Tencent eviction does not prove revocation of
an already-issued ticket; existing ticket reuse and ongoing media enforcement
require provider-specific validation. Durable retries for room closure/logout/
bulk moderation and complete concurrent moderation race tests remain necessary
before claiming end-to-end moderation guarantees. No production deployment has
been performed as part of these changes.
