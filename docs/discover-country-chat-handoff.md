# Discover, profile identity and Country Chat (108–112)

Implementation is local until deployed. Run the new country-chat and
comment-replies/likes migrations, generate Prisma, build and restart.
No balance, salary, role or historical-message backfill is performed.

## Discover notifications

`GET /api/v1/notifications?types=POST_LIKE,POST_COMMENT,COMMENT_REPLY,COMMENT_LIKE,POST_MENTION,NEW_FOLLOWER`
filters both the returned notifications and unread count. Existing pagination applies.
`action.actor` contains `publicId`, `name`, `profileImage`; post activity also includes
`postId` and, where applicable, `commentId`. Repeated likes use the same source key.
Self-notifications are suppressed. Existing notification dispatch delivers in-app events.
Existing historical FOLLOW/FOLLOW_BACK notices are not rewritten.

Post/comment mentions currently recognize explicit `@USR-123` / `@TLN-123`
tokens, at most 20 distinct targets per action, respecting blocks.
They do not guess identities from display names.

Comment replies: existing `POST /api/posts/{postId}/comments` accepts
`{ "text": "...", "parentCommentId": "..." }`. Parent must be an undeleted
comment on that same post. DTOs include `parentCommentId` and `likeCount`.
Comment likes: `POST` / `DELETE /api/posts/{postId}/comments/{commentId}/like`.
These routes use the same authentication as existing post interactions.

**Not implemented:** STORY_LIKE/STORY_REPLY integration. This repository has no
story persistence or story reaction/reply routes. Supply the owning backend/service
before integrating notifications into actual story actions.

## Profile identity

Public profile (including self), followers, following and visitors include
`specialId: string | null`. Only started, active, non-revoked, unexpired assignments
qualify. Stable `publicId` remains available for requests and identity matching.
Visitor ownership and active VIP privilege checks remain unchanged.

Agency profile cards prefer active membership. Otherwise they use the earliest
created active owned agency (ID breaks ties), for accounts owning several agencies.
Cards include `isOwner` and `ownerPublicId`. Owners get a display-only HOST role/tag;
this does not grant HOST permissions or modify their stored roles.

## Country Chat

The application continues using `CONV-WORLD`; displayed title is `Country Chat`.
Server reads country from the account, never from the request. Messages carry
`senderCountry` as ISO alpha-2. History, sync, preview/unread counts and live delivery
are country-scoped. Missing-country readers get no World messages; sends fail with
`COUNTRY_REQUIRED`: “Set your country in your profile to use Country Chat.”

Live channel is `conversation:CONV-WORLD:<country>`. Server reconciles connected
socket memberships from current account countries before broadcasting. This follows
the current single-process Socket.IO deployment; multi-process deployment needs a
shared adapter and cross-process membership reconciliation.

Old messages have NULL country and are hidden, not deleted or assigned today's
country retrospectively. If a cached reconnect cursor belongs to a country no longer
accessible, `SYNC_CURSOR_INVALID` requires a new sync without that cursor.

Links in sends and edits fail with `LINK_NOT_ALLOWED`:
“Links are not allowed in Country Chat.” Private/group chat link rules are unchanged.

## Prohibited words

Authenticated `GET /api/v1/chat/prohibited-words` returns directly:
`{ "words": ["..."], "revision": 12 }`.
Keep local filtering for UX, but server enforcement remains authoritative.
Audio-room chat already applies the same policy.

## Phone verification

- PK and DE accounts: no cross-country history, previews, unread counts, live events
  or sync results, including after reconnect or changing country.
- Missing country: cannot send; no global-history fallback.
- Retry a post like: one notification; self-like: no notification.
- Comment/reply/mention/follow navigation opens the correct actor/post/comment.
- Special ID expiry disappears on the next fetch; visitor restrictions still apply.
- Owner without member agency sees the owned agency and HOST artwork.
- Prohibited words and Country Chat links fail through direct requests too.
