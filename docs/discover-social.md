# Discover likes and comments

All routes require the existing mobile Bearer session token. Post IDs are public
`PST-*` IDs; comment IDs are opaque strings. Responses use `{success:true,data}`
or the standard `{success:false,error:{code,message}}` envelope.

- `GET /api/posts`: adds integer `likeCount`, integer `commentCount` (non-deleted
  comments only), and boolean `liked` for the authenticated viewer. Existing
  author fields include publicId, fullName, profileImage, frameUrl and badgeUrl.
- `PUT /api/posts/:postId/like`: `{liked:true,likeCount}`. Repeating it does not
  create multiple likes.
- `DELETE /api/posts/:postId/like`: `{liked:false,likeCount}`, also idempotent.
- `GET /api/posts/:postId/comments?cursor=`: newest first, 20 per page,
  `{comments:[{id,text,createdAt,author:{publicId,fullName,profileImage}}],nextCursor}`.
  Ties are ordered by ID. A cursor must belong to the requested post; soft-deleting
  its comment does not invalidate pagination. Empty/final pages return null cursor.
- `POST /api/posts/:postId/comments`: JSON `{text}`, trimmed, 1–500 Unicode code
  points. Returns 201 `{comment,commentCount}`. Invalid text: 422 VALIDATION_ERROR;
  invalid JSON: 400 INVALID_JSON. Text is plain text, not HTML markup to render.
- `DELETE /api/posts/:postId/comments/:commentId`: comment or post author only;
  soft-deletes the comment and returns `{commentCount}`. Repeat deletion is safe.

Block relationships in either direction prevent new likes/comments (403
USER_BLOCKED). Unliking or deleting one's comment remains possible after a block.
Missing posts/comments return 404; unrelated deleters get 403
COMMENT_DELETE_FORBIDDEN. Comment writes are limited to 10 attempts/minute/user
using the existing process-local limiter (429 RATE_LIMITED, Retry-After: 60).
Multi-instance deployments need a shared production limiter.

Counts are derived from database rows, never client input. Mutations use
serializable transactions with conflict retries. Post deletion cascades its likes
and comments. Sharing is not tracked: no fabricated `shareCount` is returned;
a share-recording contract is outside this request's endpoint definitions.

Deploy migration `20261001150000_discover_social`, regenerate Prisma Client and
restart the portal before enabling these endpoints on a deployment.
