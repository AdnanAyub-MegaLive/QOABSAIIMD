# Private/group chat pictures, videos and gifts — spec 101

## Deployment

Apply migration `20261019050000_chat_media`, regenerate Prisma, rebuild and restart the portal. This does not alter wallet balances or gift records. It adds message metadata/private object tracking and marks existing voice messages as `voice`.

The production host needs **ffmpeg and ffprobe**, including libx264/AAC. Optional executable overrides: `FFMPEG_PATH`, `FFPROBE_PATH`. Existing DigitalOcean Spaces credentials are used. Private objects live under `private-chat/`, with ACL private and no public CDN URL. Do not apply a bucket-wide public-read policy to this prefix. Nginx must permit a 50 MiB file plus multipart overhead; `client_max_body_size 60m` or the existing higher upload limit suffices.

No production deployment or real-account transaction is performed by this implementation. Device playback and deployed private-object access checks remain required. There is no FCM/APNs integration: notifications are in-app, with normal chat realtime delivery.

## Limits and uploads

All calls and media reads need `Authorization: Bearer <session token>`.

`GET /api/v1/conversations/{conversationId}/media` returns `data.limits`:

- Pictures: JPEG, PNG, GIF, WebP, up to 10 MiB, at most 200 frames and 25 million decoded pixels. Re-encoded as WebP, animations preserved, dimensions reduced to fit 1600×1600.
- Videos: H.264 MP4, optional AAC audio, up to 50 MiB, 60 seconds, input dimensions at most 3840×3840. Re-encoded to H.264/AAC MP4 within 1280×1280, with JPEG poster. Other video containers are not accepted; the app should export MP4.
- Up to 10 upload attempts/minute/user. Processing concurrency is bounded; retry a 429 later.

`POST /api/v1/conversations/{conversationId}/media`

Multipart: exactly one `image` or `video` file. This **uploads only**, not a message. Success 201:

```json
{"success":true,"data":{"media":{"id":"upload-id","kind":"video","url":"/api/v1/conversations/CONV-id/media/upload-id","mimeType":"video/mp4","width":640,"height":480,"durationMs":10000,"mediaVersion":"hash","posterUrl":"/api/v1/conversations/CONV-id/media/upload-id?poster=1","posterMimeType":"image/jpeg"},"limits":{}}}
```

Persist the returned media ID until send succeeds. Unsent uploads expire after 24 hours. Sent media expires after 30 days. Failed object writes and abandoned uploads are cleaned by maintenance. Deleting a message immediately prevents reading its media; physical cleanup occurs at retention expiry.

Private media URLs are relative: resolve against the API origin. Send Bearer authorization for image, poster and video reads, including Range requests. MP4 supports a single HTTP byte range (206/416). Responses use `private, no-store`; never put these URLs or files into a shared/public cache. If the app persists media locally, isolate it per account and clear it on logout. Never expose the underlying Spaces key.

## Sending an uploaded picture/video

Use the existing message endpoint:

`POST /api/v1/conversations/{conversationId}/messages`

```json
{"mediaId":"upload-id","clientMessageId":"stable-message-uuid"}
```

Alternatively Socket.IO `message:send` accepts `{ conversationId, mediaId, clientMessageId }`.

The upload must belong to this sender and this conversation and must be ready, unexpired and unused. The message atomically claims it. Retrying the same message ID/media ID returns the original message. A different upload/body with an already-used message ID returns `IDEMPOTENCY_CONFLICT`. Do not upload again just because message acknowledgement was lost.

## Sending a gift

`POST /api/v1/conversations/{conversationId}/gifts`

```json
{"giftId":"AST-id","recipientId":"USR-recipient","quantity":1,"clientMessageId":"stable-message-uuid"}
```

Use an 8–123 character clientMessageId with letters, digits, `.`, `_`, `:`, `-`. This is the authoritative sender-scoped idempotency key for chat gifts; keep it on retry. An optional Idempotency-Key header does not override it. Never send roomId/liveId. The recipient must be the other person in a direct conversation, or one chosen current group member, not the sender. World Chat is rejected.

This uses the existing **paid gift** settlement service, including its supported gift classifications and currency/XP/eligibility rules. Backpack gifts are not routed through this chat endpoint; do not use room/backpack endpoints expecting them to create chat messages.

Success 201 contains the existing gift result (`transactionId`, `recipientId`, quantity, artwork, settlement fields, `senderCoinBalance`) plus `conversationId` and `message`. Payment, recipient credit, gift record, message, receipts, in-app notification and message outbox are committed together. A failed message write rolls back settlement. Retries return the original result/balance snapshot, not another debit. Refresh the wallet separately for its latest balance after subsequent activity.

`gift:received` retains the room gift animation shape, with `conversationId` and `clientMessageId` added. Only animate when that conversation is open. `message:new` carries the persistent chat bubble. Deduplicate animations by transactionId and messages by message.id/clientMessageId; reconnect/history replay should not replay every old animation.

## Message contract

Existing `message:new`, history and `/conversations/sync` return:

- `type`: `text`, `voice`, `picture`, `video`, `gift`.
- `media`: upload descriptor above for picture/video; otherwise null.
- `gift`: gift payload containing transaction/request identity, sender, recipientId, quantity and gift artwork (`mediaUrl`, MIME, optional poster, versions), for gifts; otherwise null.
- Existing `clientMessageId`, sender identity, timestamps and body remain.
- Body fallback is `Sent a photo`, `Sent a video`, or a descriptive `Sent a gift: …` for older clients. Inbox previews use Photo/Video/Gift. Notification bodies use the same labels.

Existing read/delivery receipts and stable sync pagination apply to all kinds. Reuse the existing sync cursor flow; a missed realtime message is recovered from history/sync.

## Permissions and editing

Current membership and account status are checked at upload, send and file read. Private sending still needs mutual follow, except existing reseller/official/CS exceptions; both-direction blocks always win. Group media/gifts reject sending when the sender has a block with a current member. File reads additionally check a block with the uploader. Former participants cannot load media through copied URLs.

Only text can be edited. A sender can delete their photo/video during the first 15 minutes; text retains existing deletion behavior. Gift and voice messages cannot be deleted through this route. Deleted-message DTOs remove attachment data and file reads fail.

Important errors: `MUTUAL_FOLLOW_REQUIRED`, `USER_BLOCKED`, `CONVERSATION_NOT_FOUND`, `USER_NOT_FOUND`, `RECIPIENT_UNAVAILABLE`, `INSUFFICIENT_COINS`, `VALIDATION_ERROR`, `FILE_TOO_LARGE`, `RATE_LIMITED`, `CHAT_MEDIA_UNAVAILABLE`, `CHAT_STORAGE_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT`, `MESSAGE_EDIT_FORBIDDEN`, `MESSAGE_DELETE_WINDOW_EXPIRED`.

## Phone/deployment checklist

1. Send still/animated images and MP4 in direct and group chats. Confirm GIF/WebP frames animate, dimensions stabilize the bubble, video poster/audio/range seeking work.
2. Retry the same media send and gift after dropping the response; confirm a single message and a single gift charge.
3. Test insufficient funds, another group's recipient, unfollow, block, ban, and removal from group. Confirm copied file URLs fail without authorization or from a nonmember.
4. Confirm World Chat rejects every new media/gift operation.
5. Verify text edit, picture/video delete within/after 15 minutes, and no gift edit/delete.
6. Reconnect and paginate sync; check new kinds, read marks, inbox labels, no duplicate bubbles/animations and older-client fallback text.
7. Verify raw Spaces URLs for both video and poster are forbidden while authenticated participant endpoints succeed.
