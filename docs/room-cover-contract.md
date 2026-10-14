# Room cover updates

All room-card serializers (My rooms/start/update, recent, discover/Hot/Party, search), room settings responses and Socket.IO join snapshots include `coverImageUrl` and integer `coverRevision`. No separate Party backend exists; Party uses the shared room endpoints. Owners, admins and listeners get the same canonical fields. The cover revision is independent of room, seat and membership revisions.

`POST /api/audio-rooms/cover` remains authenticated multipart with `image` (JPEG/PNG/WebP, up to 10 MB). Optional `roomId` selects a target room. Omission preserves the own-room behavior. Explicit targets require room owner/delegated-admin `canManagePrivacy`; a platform role alone grants no mobile room authority. Authorization and image/audit/revision writes run in one transaction. Every committed upload increments coverRevision exactly once. Failed validation/authorization does not increment it.

Response: `{ success: true, data: { roomId, coverImageUrl, coverRevision, revision } }`. The identical payload goes to room members via `audio-room:updated`. URLs for portal-hosted covers include `?v=<coverRevision>` to invalidate image caches. Image responses include ETag and X-Cover-Revision and require revalidation; the endpoint serves the current cover, not historical versions.

All connected authenticated sockets additionally receive `audio-room:catalog-changed` with `{ success: true, data: { reason: "COVER_UPDATED" } }`. This intentionally omits room identifiers/private metadata. Debounce list refetches (e.g. 500ms) across My/recent/Hot/Party views. Do not rejoin or reconnect audio. Apply only newer cover revisions for the same room and use the complete versioned URL as the image cache key. Refetch on reconnect to recover missed invalidations. Existing clients need this listener to refresh lists while outside a room.

Migration `20261014180000_room_cover_revision` sets existing covers to revision 1 and empty rooms to 0. Deploy migration, regenerate Prisma, build and restart server.js/PM2. Local tests cover versioning and upload authorization; actual mobile image-cache behavior still needs device QA.
