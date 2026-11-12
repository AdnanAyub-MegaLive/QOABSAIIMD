# Spec 212: Discover post cards in DMs

## Send

Use the existing DM creation flow, then send one message:

```http
POST /api/v1/conversations/{conversationPublicId}/messages
Authorization: Bearer <mobile-session>
Content-Type: application/json
```

```json
{ "postId": "POST-…", "clientMessageId": "unique-client-generated-id", "body": "" }
```

Do not upload a chat photo or send the fallback text as well. Reuse the same clientMessageId for retries; reuse with another post returns `IDEMPOTENCY_CONFLICT`. Post cards require a DIRECT conversation, an empty body, and no mediaId/voice attachment. Existing membership, mutual-follow and block rules for sending DMs still apply.

An unavailable, unapproved or blocked post returns HTTP 404 `POST_NOT_FOUND`. The post must be APPROVED with an active, non-deleted author and no block in either direction between the author and either DM participant. Post cards do not create Official notifications.

## Receive

The existing message envelope uses **`type: "post"`** (database kind is `post`), `body: "Shared a post"`, `metadata: { postId }`, and:

```json
{
  "post": {
    "id": "POST-…",
    "author": { "publicId": "USR-…", "fullName": "Name", "profileImage": null },
    "description": "First 200 characters",
    "imageUrl": "https://portal.megachat.live/api/posts/POST-…/image",
    "likeCount": 0,
    "commentCount": 0,
    "available": true
  }
}
```

Included in the send REST response, history, REST sync and socket sync. The repository's existing Socket.IO event is **`message:new`**, with `{ conversationId, message }`; keep the app's existing mapping to its chat-message event. Socket `message:send` also accepts postId. No separate socket event is introduced.

Cards are rebuilt from current post data on reads and retries. When deleted, moderated away from APPROVED, or blocked for either participant:

```json
{ "post": { "id": "POST-…", "available": false } }
```

No author, description, image or counts are sent in that unavailable object. Render an unavailable-post placeholder and disable navigation. A deleted chat message itself has `post: null`, as with other deleted-message content.

For available cards, open the existing authenticated `GET /api/posts/{postId}`. Handle a 404 if visibility changes after the card was loaded. Previously loaded cards are not automatically erased by a new socket event; refresh history/card state when reopening the chat. Counts represent the latest read, not a persistent snapshot.

## Shares and Portal

`Post.shareCount` increments once per sender/post across all their DMs. A transaction and unique sender/post row prevent retries, concurrent sends, or multiple recipient chats from double-counting. Failed sends roll back the increment. The post DTO includes `shareCount`. Existing photo/text fallback shares are not retroactively counted.

Portal Messages shows "Shared post", a Post type filter, and a link to the exact post in Content Moderation. The target page retains its `content.view` permission requirement. Post messages cannot be edited as ordinary text.

## Deploy

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh
```

This applies the required Post.shareCount/PostShare migration. No event-template republish is needed. App post-card sending/rendering must be enabled after this backend deploy.
