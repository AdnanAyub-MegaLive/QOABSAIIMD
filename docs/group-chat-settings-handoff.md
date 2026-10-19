# Group chat details — spec 105

## Endpoint contract

All endpoints use Bearer authentication. Paths use the conversation's public ID (`CONV-…`).

### Read details

`GET /api/v1/conversations/{conversationId}`

Members only. Returns `{ success: true, data: { conversation: { ... } } }`.

### Rename, description, owner transfer

`PATCH /api/v1/conversations/{conversationId}`

```http
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: <stable-request-uuid>
```

Send only fields to change:

```json
{"name":"Mega friends","description":"Welcome to our group"}
```

Transfer ownership to another current active member:

```json
{"ownerPublicId":"USR-123456"}
```

The former owner becomes MEMBER. The new owner becomes OWNER immediately. `createdById` remains historical creator metadata; never use it as the current owner. Use the returned `owner` and participant roles.

Name: 2–80 characters, trimmed, prohibited-word filter applied. Description: up to 500 Unicode characters, trimmed, word filter applied; `""` or `null` clears it. Omitted fields remain unchanged. A JSON `requestId` can substitute for the header on PATCH. If both are present, the header wins. IDs must be 8–128 characters: letters, numbers, `.`, `_`, `:`, `-`.

### Upload/replace icon

`POST /api/v1/conversations/{conversationId}/icon`

Multipart with exactly one file named **image**. Supply **Idempotency-Key** in a header. Up to 5 MiB, still JPEG/PNG/WebP. GIF and animated WebP are rejected. The server verifies/decodes/re-encodes the image, strips metadata, and fits it within 512×512 WebP. Up to 10 uploads/hour per owner.

### Remove icon

`DELETE /api/v1/conversations/{conversationId}/icon`

Supply Idempotency-Key. Removing a missing icon succeeds without a new system line.

### Leave a group

Use the existing route:

`DELETE /api/v1/conversations/{conversationId}/members/{ownPublicId}`

A former owner can leave normally after transferring ownership. An owner with other members receives `GROUP_OWNER_CANNOT_LEAVE`. When the owner is the only member, leaving closes the group and removes their membership. The response has `conversation.closed: true`; remove it from the inbox. This is a close, not a destructive deletion of message history.

## Returned data and realtime

Group creation/member updates, the conversation list, GET details, successful edits and `conversation:updated` all include:

```json
{
  "id":"CONV-…",
  "type":"GROUP",
  "name":"Mega friends",
  "description":"Welcome to our group",
  "iconUrl":"/api/v1/conversations/CONV-…/icon/icon-id",
  "iconMimeType":"image/webp",
  "owner":{"publicId":"USR-123456","name":"Ali","profileImage":null},
  "revision":3,
  "closed":false
}
```

No icon means `iconUrl`/`iconMimeType` are null. Full group responses additionally include participants with current roles.

`conversation:updated` payload: `{ conversation: <new group DTO> }`, matching existing membership updates. Apply newer revisions; an idempotent replay may return an older committed snapshot, so do not overwrite newer local revisions.

`message:new` receives one persisted system message per changed request (`type: "system"`, `senderId: null`, ordinary text `body`, such as “Ali changed the description.”). Render it as a short centered line. Older clients can render the body. System lines participate in history/sync and cannot be edited/deleted by a user. Unchanged values do not create system lines. Retry with the exact same key/body to recover the original result; a changed body with the same key returns `IDEMPOTENCY_CONFLICT`.

All edits, owner-role changes, system lines and durable realtime events commit in one serializable database transaction. Removed/banned users cannot change details or read icons. New edit requests require the current owner. A successful transfer can be replayed by its former owner while they remain a member.

## Icon privacy and replacement

Resolve relative icon URLs against the API origin and include Bearer authorization when fetching. Icons are private Spaces objects; do not use a raw object-storage/CDN URL. The URL changes for every replacement. Replaced/removed icons remain readable by **current members** for one hour, then become unavailable and are cleaned up. Leaving/removal immediately removes server-side read access. Responses use `private, no-store`; never place icon files in a shared public cache.

Uploads that fail or are abandoned expire after 24 hours. An upload retry can leave an unused temporary object but cannot create a second system line. The maintenance process cleans expired objects.

## Errors

- `GROUP_OWNER_REQUIRED` (403): only the group owner can do this.
- `CONVERSATION_NOT_FOUND` (404): group unavailable, closed, or caller removed.
- `GROUP_MEMBER_NOT_FOUND` (404): new owner must be a current member.
- `USER_NOT_FOUND` (404): account inactive, banned or deleted.
- `GROUP_OWNER_CANNOT_LEAVE` (409): transfer ownership first.
- `GROUP_NAME_INVALID`, `VALIDATION_ERROR`, `INAPPROPRIATE_WORD` (422).
- `FILE_TOO_LARGE` (413), `RATE_LIMITED` (429), `IDEMPOTENCY_CONFLICT` (409).

## Deployment and verification

This implementation depends on the pending spec-101 chat-media changes (private storage and message kind support). Deploy the migrations in order, including `20261019050000_chat_media` and `20261019060000_group_details`, generate Prisma, rebuild and restart. Existing Spaces credentials are required. No user balances or financial records are changed.

Verify on two phones: owner edits name/description/icon; other member sees the updated inbox, header, group info and exactly one system line. Retry requests after dropping acknowledgements. Transfer ownership, confirm permissions reverse, then let the old owner leave. Verify sole-owner closure, invalid/animated/oversized images, word filtering, denied direct calls by members/banned users, and old icon links before/after the one-hour grace. Production and phone testing remains pending.
