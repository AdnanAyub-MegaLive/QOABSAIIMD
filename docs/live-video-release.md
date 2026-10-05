# Live video release additions — 2026-10-05

- Authenticated POST `/api/v1/live-video/cover`: multipart `cover`, JPEG/PNG/WebP <=5 MB. Sharp decodes and re-encodes WebP, strips metadata and bounds pixels/dimensions. Returns `{success:true,data:{coverUrl}}`. Start/PATCH validate the cover belongs to the signed-in host on this portal; list/detail serialize absolute URLs.
- `live-video:gift` includes signed gift media/poster descriptors, decorated sender, giftBatchId/comboId and lucky/blindBox metadata when applicable. Gift income updates commit with the gift transaction.
- Host-only POST `/{liveId}/guests/invite` accepts `{userPublicId}` and emits `live-video:guest-invited` to that user with liveId, requestId, host, slot, expiresAt. Invitations reserve one of four slots for 60 seconds. POST `/{liveId}/guests/invite/respond` accepts `{accept:boolean}` from the invited user. Acceptance uses approved guest permissions and emits guest response/changed events. Serializable transactions prevent concurrent slot allocation.
- Hosts must POST presence heartbeats more frequently than 90 seconds. Feed filters stale hosts immediately; maintenance ends stale sessions, clears presence/guest state and emits `live-video:ended` with HOST_HEARTBEAT_TIMEOUT. Local one-off cleanup: `node scripts/cleanup-stale-video.mjs`.

## Release infrastructure still required

Production rejects ws:// and private/internal LiveKit addresses. Provision a real public LiveKit TLS endpoint and set LIVEKIT_URL to its wss:// URL; route signaling/media/TURN correctly and verify from a release APK over a separate network. No public TLS endpoint has been provisioned by these source changes. Local ws:// development remains supported.

Apply migrations, regenerate Prisma, build, then restart the custom server. Local migrations/tests are not evidence of production deployment. Cover endpoints, invitations and real-device media should be smoke-tested on staging before release.
