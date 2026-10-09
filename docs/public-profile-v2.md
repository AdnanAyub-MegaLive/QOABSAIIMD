# Public profile integration — October 8, 2026

GET `/api/v1/users/{publicId}/profile` requires Bearer authentication. Returns the existing success/data/user envelope. No-store caching avoids stale roles, equipment, privacy, or agency membership.

- `equippedAssets.avatarFrame`, `profileBadge`, `profileDress`: explicit equipped, active, entitled assets only. Null after unequip. Categories FRAMES, BADGES and PROFILE_DRESS respectively. Descriptor fields: assetId, url, posterUrl, mimeType. Compatibility frameUrl/badgeUrl/homeDress fields match the canonical descriptors.
- `progression.user/charm`: backend level, decimal-string lifetimePoints, badgeUrl. Counters wealth/charm use these points, not wallet balances.
- `roleBadges`: active application-role codes with backend labels and optional artwork. Existing records remain readable; replacement configuration workflow is pending.
- `agency`: active membership only, publicId/name/status/level/logoUrl/badgeUrl. Existing identity records remain readable; replacement artwork/level configuration workflow is pending.
- `topSupporters`: up to three active senders, sum of committed GiftTransaction.coinValue, excluding reversedAt records. Financial refund implementations must set reversedAt in their refund transaction; this change does not implement financial refunds.
- `medalWall`: earned non-revoked/non-expired MEDALS awards, pinned first, first four. These are not equipped badges or progression badges. Replacement grant/revoke workflow is pending.

The Profile Display portal section and its `/api/admin/profile-display` API were
removed on 2026-10-09 at product request. Database records, upload assets and
mobile profile read responses are preserved. No replacement editor is introduced
by this removal.
- `giftWall`: aggregate by gift asset, descending value/quantity with a stable tie-breaker. Monetary values are strings.
- `relationship`: isSelf/isFriend/isFollowing/followsYou/isBlocked and friendRequest status/id. Blocked profiles return PROFILE_BLOCKED rather than leaking the target profile.
- DOB and calculated age are null for viewers not permitted to see DOB. Walls use the same private/block checks as the profile.
- Visits: unique-visitor counter; a repeated viewer increments visitCount at most once per 24 hours, using an atomic database upsert. Writes run after the response and can appear on the next fetch.

Walls: `/api/v1/users/{publicId}/profile/walls?type=badges|gifts|photos&cursor=...&limit=20`. The badges wall now means earned medals, not badge inventory. Cursors are opaque base64url values; use nextCursor verbatim. Ranked gift pagination can shift when new gifts arrive; refresh the first page after updates.

Social lists: `/api/v1/users/{publicId}/followers`, `/following`, `/visitors`, with cursor/limit, return data.items and nextCursor. Each person includes isFollowing from the viewer's perspective. Visitor identities are owner-only; aggregate visitor counts remain public. Existing follow POST/DELETE endpoints are retained.

## Relationships

Conservative initial rule: one active partner per user per type (CP/BFF/BRO/SIS), mutual consent. Both accounts must be active; pair IDs are canonicalized and deduplicated. User row locks and serializable transactions protect concurrent acceptance. Requests expire in seven days; accepted relationships do not auto-expire. Levels start at zero; no unsupported relationship-XP rule is invented.

`GET /api/v1/users/me/relationships` lists up to 50 pending sent/received requests.

`POST /api/v1/users/me/relationships`:
- Request: `{ "action": "REQUEST", "userPublicId": "USR-…", "type": "CP" }`
- Accept/reject/remove: `{ "action": "ACCEPT|REJECT|REMOVE", "relationshipId": "REL-…" }` (use one action).
- Returns data `{id,type,status}`. Only the invited party may accept; either member may end an active relationship. No client-supplied level, days, account ID or acceptance timestamp is used.

The one-partner-per-type rule is the conservative proposed policy and should be confirmed before rollout. No relationship records were fabricated or backfilled.

Upload separate artwork using **Profile Dresses, Medals, Role Artwork, Agency Artwork**. Profile dress MP4 uploads require a poster. Existing props purchase/equip ownership checks remain in force.

Apply migration `20261008090000_public_profile_domains`, generate Prisma and restart the custom server. Existing agencies start with level 0 and no artwork; administrators must configure real values. Existing medals/relationships are not inferred from badge ownership or friendships.
