# Profile visitor information

`GET /api/v1/users/{publicId}/visitors?limit=20&cursor=...` requires the authenticated profile owner. Existing blocking and active-account visibility filters are preserved.

Each `data.items[]` retains identity, avatar, `frameUrl`, `badgeUrl`, official/following flags and now includes:

```json
{
  "firstVisitedAt": "2026-10-17T05:20:00.000Z",
  "lastVisitedAt": "2026-10-19T05:20:00.000Z",
  "visitCount": 3,
  "artwork": { "avatarFrame": null, "profileBadge": null, "profileDress": null, "userTag": null, "profileBackground": null }
}
```

Artwork uses the existing equipped-profile resolver (active assets and valid ownership). Non-null descriptors include asset ID, URL, poster URL and MIME type.

Counting is unchanged: first eligible non-self profile view creates count 1. Another visit increments count and updates latest time only **more than 24 hours after the previous recorded visit**. Intermediate views update neither field. This is a rolling window, not a calendar-day count, and does not count every page opening. First visit time is preserved. Old unrecorded visits cannot be reconstructed.

Timestamps are ISO 8601 UTC (`Z`). Format on mobile in the viewer's timezone. For Asia/Karachi, the latest timestamp above displays `10:20 AM Monday 19-10-2026`, followed by `3 visits`.

Pagination is newest recorded timestamp first, visitor ID ascending for ties. Use the returned opaque `nextCursor`; null means finished. Visitor cursors now use keyset pagination, not offsets: discard any cached old cursor and restart at page one after rollout. Followers/following pagination is unchanged. New/repeated recorded visits can move entries ahead of an existing cursor; refresh page one to see these updates.

Empty lists return success with `items: []` and `nextCursor: null`; errors remain errors. No schema migration required.
