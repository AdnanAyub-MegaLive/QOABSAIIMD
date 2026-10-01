# Mobile Rankings API

```http
GET /api/rankings?type=overall&period=week&limit=20&cursor=...
Authorization: Bearer <sessionToken>
```

Supported types: `overall`, `streamers`, `listeners`, `liveRooms`, `earners`.

Supported UTC periods: `today`, `week` (Monday 00:00 UTC), `month`, and `allTime`.

## Authoritative score definitions

- `overall`: completed earned wallet credits (`GIFT_RECEIVED`, `TRANSFER_RECEIVED`, `BONUS`, and `REFUND`). Purchased top-up coins are deliberately not treated as earnings.
- `streamers`: completed gift earnings for active users with the `HOST` application role.
- `listeners`: completed gift-sending value for active users who are not hosts.
- `liveRooms`: room gift coins + overlapping live minutes + (`participantCount` × 100).
- `earners`: completed gift earnings across all active users.

Scores come exclusively from the immutable wallet ledger, gift records, and audio-room records. The endpoint never accepts scores from the client.

Active user bans and non-active/deleted accounts are excluded. Ranking ties use permanent `publicId` ascending. Active Special IDs are returned only as `displayId`; `publicId` remains the permanent identity.

The first three entries are returned in `podium`. `rankings` starts at rank four and uses an opaque cursor with a maximum page size of 50. `viewerRank` is `null` when the authenticated user is not eligible or has no positive score for that ranking.

Frame and badge URLs are resolved through the existing assigned/equipped asset rules and returned as signed public-display URLs.
