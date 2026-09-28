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
- Only playback metadata is synchronized; local device paths are rejected/removed.
- `POST /api/v1/audio-rooms/{roomId}/campaign/contribute` atomically debits coins and broadcasts progress.
- Existing Games Management remains the server-authoritative game catalogue and wallet settlement system.
- Existing daily tasks track watch/live/gift progress and are managed at `/daily-tasks`.

## Gifts and PK

- `POST /api/v1/gifts/send-multi` atomically sends to 1–12 room members, including the sender.
- `GET /api/v1/gifts/backpack`, `/backpack/purchase`, and `/backpack/send` provide prepaid gift inventory.
- Gift tiers now include `LUCKY` and `BLIND_BOX`; Lucky reward bounds are portal-controlled in basis points.
- `GET|POST|PATCH /api/v1/audio-rooms/{roomId}/pk` controls audio PK. Only committed gift transactions change scores.
- VIP sticker and campaign-widget artwork are managed through Upload categories `VIP_STICKERS` and `CAMPAIGN_WIDGETS`.

## Live video

- `GET|POST /api/v1/live-video`: feed/start.
- `GET|PATCH|DELETE /api/v1/live-video/{liveId}`: reconnect snapshot, away/back/update, end.
- `POST /presence`: join, leave and like.
- `GET|POST|PATCH|DELETE /guests`: request, approve/reject and remove across four publisher slots.
- `POST /livekit-token`: host/approved-guest publish permission; viewers are subscribe-only.
- `GET|POST|PATCH /pk`: live PK with committed-gift scoring.
- Gifts accept `liveId`; `/summary` returns duration, peak viewers, likes, income and recent gifts.
- Socket rooms use `live-video:join`/`live-video:leave`; state, guest, gift, viewer, like and PK events are revisioned.

## Public profiles

- `GET /api/v1/users/{publicId}/profile` returns identity, decorations, bio/country, privacy-aware DOB, relationship/family context, live-room context and counters.
- `POST` on the same route likes/unlikes a profile and profile views are recorded server-side.
- `GET /api/v1/users/{publicId}/profile/walls?type=photos|gifts|badges` provides paginated walls.
- Deleted, inactive, blocked and private profiles fail closed.
- `PATCH /api/v1/users/me` controls `profilePrivate` and `showDateOfBirth`.

## Release requirements

Run `npx prisma migrate deploy`, restart the custom `node server.js` process, and deploy the same commit for HTTP and Socket.IO. LiveKit must be configured for video publishing. Android must treat all IDs and cursors as opaque strings and ignore unknown response fields.
