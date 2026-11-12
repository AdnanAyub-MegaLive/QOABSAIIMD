# Specs 200–205 — Live video and host verification

Requires Droplet deployment and the `20261112200000_live_journey_kyc` migration. Existing sessions default to SOLO / CHAT / PUBLIC. No app release is needed for Portal review or provider cleanup; the mobile app must use the fields/routes below.

## 200 / 203 — Setup and group video

`POST /api/v1/live-video` accepts `title`, `coverUrl`, plus:

```json
{"announcement":"Welcome!","category":"CHAT","privacyMode":"PUBLIC","mode":"GROUP"}
```

Announcement is nullable, at most 300 characters. Categories: GAME, CHAT, MUSIC, OTHER. Privacy: PUBLIC, FOLLOWERS, PRIVATE. Modes: SOLO, GROUP. The session serializer and socket join snapshot return these fields plus `maxGuests` (4 for SOLO, 8 for GROUP). `PATCH /api/v1/live-video/{liveId}` updates announcement/category/privacy; mode is chosen at start and cannot change during the session.

`GET /api/v1/live-video?category=GAME` filters by category. Followers-only requires the viewer to follow the host. Private requires an invitation. These restrictions apply to feed, session details, presence, socket join, PK reads and both RTC token routes. Bans and blocks are enforced. Changing privacy removes viewers who no longer qualify.

Host invites a private viewer with `POST /api/v1/live-video/{liveId}/invitations { "participantId": "USR-…" }`. Recipient receives `live-video:invited { liveId, host, title }`. Invitations last for that live session. Guest invitations also grant private-room access. Existing guest request/invite/respond routes allocate up to eight guest seats in GROUP; the app renders the grid.

## 201 — Follower alerts

Uses the existing stored-notification and socket flow, as confirmed by the owner. **No external offline-push provider was added.** An eligible follower gets an inbox notification with type `LIVE_FOLLOWED_STARTED`, body `"{name} is live: {title}"`, and action `{ screen: "LIVE_VIDEO", liveId, host, title, coverUrl }`.

Socket dispatcher also emits `live-video:followed-started` with that action object (unwrapped). The host cooldown is a rolling 30 minutes persisted in the database; notification source keys prevent duplicates on request retries. Blocked/banned users and uninvited private-live followers do not receive alerts.

## 202 — Random PK

`POST /api/v1/live-video/{liveId}/pk/random`:

```json
{"action":"JOIN","mode":"1V1"}
```

Returns `data.status: "WAITING"` with `expiresAt`, or `"MATCHED"` with `pk`. Both consenting queued hosts start a five-minute PK immediately and receive the usual `live-video:pk-changed { success: true, data: pk }` event. Queue entries expire after two minutes; repeat JOIN to renew while waiting. Send `{ "action": "LEAVE" }` to leave (`status: "LEFT"`). Join requires an active verified host. Matching skips inaccessible opponents and is serialized with direct PK invitations to prevent overlapping battles.

Existing invite PK accepts optional `mode: "1V1"`. PK responses/events include mode. Other modes, including 2V2, return validation errors until team gameplay is implemented; the schema now has room for them.

## 204 — Provider cleanup

Video removal uses TRTC RemoveUserByStrRoomId or LiveKit removeParticipant for `video-{liveId}`. Both host and admin end routes mark the session ended, clear viewers/guests/queue and active PK state, emit `live-video:ended`, then dismiss/delete the provider room. Failed room cleanup remains pending and maintenance retries it. RTC credentials cannot be refreshed for ended sessions. Provider calls were tested with mocks, not a real live production room.

## 205 — Host KYC

Bearer routes: `GET /api/v1/me/kyc` and multipart `POST /api/v1/me/kyc`.

Fields: legalName (3–80), idType (NATIONAL_ID/PASSPORT/DRIVING_LICENSE), identityCardFront, identityCardBack (optional only for PASSPORT), selfie. Each image must be JPEG/PNG/WebP, up to 10 MB. Server decodes and re-encodes images, strips metadata and stores them in private database storage. No public document URL is exposed.

Response is `{ success: true, data: { status, isVerified, rejectionReason, submittedAt, reviewedAt, idType } }`. Status: NONE/PENDING/APPROVED/REJECTED. Only hosts or users with a matching Talent record may submit. A host without a legacy Talent row is supported through a direct user link. One pending submission at a time, three submissions per rolling 24 hours, already verified accounts refused. Expected errors: KYC_HOST_REQUIRED (403), KYC_PENDING (409), KYC_ALREADY_VERIFIED (409), KYC_RATE_LIMITED (429).

Review at **Live Management → Hosts & KYC**, with `video.view`, `hosts.view`, and `hosts.manage` permissions. Approve sets the verification status/reviewer/time and `user.isVerified`; Reject requires a reason. Document views and decisions are audit-logged. Users receive an existing inbox notification and `kyc:changed { status, rejectionReason }`; refresh GET on receipt. Admin document routes require a Portal session plus `hosts.manage` and must not be used by the mobile app.

## Deployment / QA

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh
```

Verify public/follower/private feed and direct RTC denial, private invitations, eight group slots, random JOIN/MATCHED/LEAVE, follower cooldown across restarts, and provider removal/end on the configured RTC service. Submit each KYC document type, reject then resubmit, approve and confirm go-live access. Verify unauthenticated users and staff without the permission cannot load KYC images.
