# Mobile messaging API

> New Android integration must use the versioned routes in
> [`mobile-api-v1.md`](./mobile-api-v1.md). The unversioned routes documented
> below remain only as a transition layer for legacy portal clients.

All mobile endpoints require:

```http
Authorization: Bearer <sessionToken>
```

Responses use the standard `{ "success": true, "data": ... }` envelope.
Errors use `{ "success": false, "error": { "code", "message" } }`.

## Conversations

```http
GET /api/conversations
```

Returns direct conversations plus the well-known World Chat conversation.
Each item includes `lastMessage`, `lastMessageAt`, and a server-computed
`unreadCount`. Direct-conversation `participant` objects include
`frameUrl` and `badgeUrl` alongside `id`, `name`, and `profileImage`.

```http
POST /api/conversations
Content-Type: application/json

{ "participantId": "USR-2048" }
```

Creates or returns the existing direct conversation for that pair of users.
Starting a conversation with oneself is rejected.

## Messages

```http
GET /api/conversations/:conversationId/messages?limit=50&cursor=MSG-...
```

Messages are returned in chronological order. Use `nextCursor` while
`hasMore` is `true`; the maximum page size is 100.

```http
POST /api/conversations/:conversationId/messages
Content-Type: application/json

{ "body": "Hello!" }
```

Message bodies must contain 1–2000 characters. A persisted message is emitted
to every participant as:

```js
socket.on("message:new", (event) => {
  // event.conversationId
  // event.message includes senderProfileImage, senderFrameUrl, senderBadgeUrl
});
```

The same operation is available over Socket.IO:

```js
socket.emit(
  "message:send",
  { conversationId: "CONV-WORLD", body: "Hello world!" },
  handleAcknowledgement,
);
```

## Read state

```http
POST /api/conversations/:conversationId/read
```

This updates the caller's `lastReadAt` and emits `conversation:read` to the
conversation.

## Delivery and reconnect synchronization

New messages create a persistent receipt for every non-sender participant.
After persisting a received message locally, the client acknowledges it:

```js
socket.emit(
  "message:delivered",
  { conversationId: "CONV-WORLD", messageId: "MSG-..." },
  handleAcknowledgement,
);
```

The server emits `message:delivered` with `{ conversationId, messageId, userId,
deliveredAt }`. When a conversation is opened, `conversation:read` records the
same kind of server-authoritative receipt and emits `{ conversationId, userId,
lastReadAt }`.

For reconnect/offline synchronization, Android uses the stable v1 contract:

```http
GET /api/v1/conversations/sync?cursor=MSG-...&limit=50
```

or the Socket.IO equivalent:

```js
socket.emit("conversation:sync", { cursor: "MSG-...", limit: 50 }, handleAcknowledgement);
```

The result is chronologically ordered across conversations and contains
`messages`, `nextCursor`, and `hasMore`. Continue while `hasMore` is true;
cursor values are opaque and tied to the authenticated user.

## System notifications

```http
GET /api/notifications?limit=50
POST /api/notifications/:notificationId/read
```

The list contains notifications addressed to the caller and global broadcasts.
Global notification read state is stored separately per user.

Administrators can persist and deliver a notification using their portal
session:

```http
POST /api/notifications
Content-Type: application/json

{
  "title": "Agency applications are open",
  "body": "Tap the banner to learn more.",
  "userId": null
}
```

Omit or set `userId` to `null` for a global broadcast. Set it to a user public
ID for a personal notification. Connected apps receive `notification:new`.

## World Chat

World Chat always uses:

```text
CONV-WORLD
```

Membership is created automatically when an authenticated user connects to
Socket.IO, lists conversations, or directly accesses World Chat.

## Admin history

Stored direct messages, World Chat records, and received system notifications
are visible only inside that user's authenticated portal profile:

```text
/users/:publicId
```

The profile includes local word search across message text, notification
titles, senders, conversation names, record types, and message IDs.
World Chat history on a profile includes only messages authored by that user.
Direct messages are grouped into one clean row per conversation; opening the
row shows both sides in a modal and links the counterpart to their own profile.
