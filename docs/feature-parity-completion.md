# MegaLive feature-parity backend contract

This document records the completed replacement contracts added in the 2026-09-28 parity pass. All endpoints require the opaque mobile bearer session unless stated otherwise. Socket.IO uses the same token in `auth.token`.

## Room chat

- `GET /api/v1/audio-rooms/{roomId}/messages?limit=&cursor=` provides opaque-cursor history.
- `audio-room:join` returns `chatHistory` for reconnect recovery.
- `audio-room:message` accepts a stable `requestId`; duplicates acknowledge the original message without another broadcast.
- Member history is visible for 30 days. Clear Chat advances `chatRevision`; it does not destroy moderation records.

## Business Cards

- Upload/store category: `BUSINESS_CARD`.
- Images and MP4 are supported; MP4 requires a PNG/JPEG/WebP poster.
- Purchase/equip uses the existing Store and Props endpoints.
- Profile, seat and member DTOs return `businessCardUrl`, `businessCardPosterUrl`, and `businessCardMimeType`.

## Room entertainment

- `GET|PATCH /api/v1/audio-rooms/{roomId}/entertainment` controls revisioned `music`, `game`, `campaign`, and `watch` state.
- Local-device room music is implemented with a dedicated, publish-only LiveKit identity from `POST /api/v1/audio-rooms/{roomId}/music-token`.
- `audio-room:music-play|pause|seek|stop` persist and broadcast canonical metadata; `audio-room:join` returns `musicState` for reconnect recovery.
- Only playback metadata is synchronized. Local paths, content URIs, music bytes and playable URLs are never accepted or stored by the portal.
- `POST /api/v1/audio-rooms/{roomId}/campaign/contribute` atomically debits coins and broadcasts progress.
- Existing Games Management remains the server-authoritative game catalogue and wallet settlement system.
- Existing daily tasks track watch/live/gift progress and are managed at `/daily-tasks`.

## Audio-room presence and moderation

- Socket.IO membership is reconciled against Prisma at startup and every 15 seconds, repairing stale `socketCount` and `participantCount` values after a crash or restart.
- Presence counts unique users while retaining per-user multi-socket counts for correct disconnect behavior.
- `POST /api/v1/audio-rooms/{roomId}/kicks` supports kick-only, timed bans and permanent bans for seated or non-seated members.

## Gifts and PK

- `POST /api/v1/gifts/send-multi` atomically sends to 1–12 room members, including the sender.
- `GET /api/v1/gifts/backpack`, `/backpack/purchase`, and `/backpack/send` provide prepaid gift inventory.
- Gift tiers now include `LUCKY` and `BLIND_BOX`; Lucky reward bounds are portal-controlled in basis points.
- Lucky rewards are funded from the company settlement share rather than minting coins, and Blind Box reveals are persisted in the sender's backpack inventory.
- Backpack gifts use the same settlement, recipient ledger, PK scoring, ranking broadcasts and daily-task progress as wallet-funded room gifts.
- Multi-recipient retry lookup is scoped to the authenticated sender.
- `GET|POST|PATCH /api/v1/audio-rooms/{roomId}/pk` controls audio PK. Only committed gift transactions change scores.
- Expired audio/video PK sessions are finalized automatically and also reconciled before PK reads.
- VIP sticker and campaign-widget artwork are managed through Upload categories `VIP_STICKERS` and `CAMPAIGN_WIDGETS`.

## Live video

- `GET|POST /api/v1/live-video`: feed/start.
- `GET|PATCH|DELETE /api/v1/live-video/{liveId}`: reconnect snapshot, away/back/update, end.
- `POST /presence`: join, leave and like.
- Socket presence counts unique users across multiple connections and stale viewer records are reconciled automatically.
- `GET|POST /api/v1/live-video/{liveId}/moderation` provides persistent reports, temporary/permanent bans, unban and report resolution; bans are enforced by REST and Socket.IO joins.
- `GET|POST|PATCH|DELETE /guests`: request, approve/reject and remove across four publisher slots.
- `POST /livekit-token`: host/approved-guest publish permission; viewers are subscribe-only.
- `GET|POST|PATCH /pk`: live PK with committed-gift scoring.
- Gifts accept `liveId`; `/summary` returns duration, peak viewers, likes, income and recent gifts.
- Socket rooms use `live-video:join`/`live-video:leave`; state, guest, gift, viewer, like and PK events are revisioned.

## Public profiles

- `GET /api/v1/users/{publicId}/profile` returns identity, decorations, bio/country, privacy-aware DOB, relationship/family context, live-room context and counters.
- `GET|POST|DELETE /api/v1/users/{publicId}/follow` provides independent follow state and follower/following counts; friendship is no longer used as a substitute.
- `POST` on the same route likes/unlikes a profile and profile views are recorded server-side.
- `GET /api/v1/users/{publicId}/profile/walls?type=photos|gifts|badges` provides paginated walls.
- Deleted, inactive, blocked and private profiles fail closed.
- `PATCH /api/v1/users/me` controls `profilePrivate` and `showDateOfBirth`.

## Release requirements

Run `npx prisma migrate deploy`, restart the custom `node server.js` process, and deploy the same commit for HTTP and Socket.IO. LiveKit must be configured for video publishing. Android must treat all IDs and cursors as opaque strings and ignore unknown response fields.
