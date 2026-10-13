# Recently visited audio rooms

`GET /api/v1/audio-rooms/recent?limit=20&cursor=...`

Legacy alias: `/api/audio-rooms/recent`. Bearer authentication required. Limit 1–50, default 20. Omit cursor for the first page; pass the returned opaque cursor unchanged for subsequent pages.

```json
{
  "success": true,
  "data": {
    "rooms": [{
      "roomId": "ROOM-123",
      "title": "Friends",
      "coverImageUrl": "https://portal.example/cover.webp",
      "status": "IDLE",
      "participantCount": 0,
      "lastVisitedAt": "2026-10-13T12:00:00.000Z",
      "privacyMode": "PUBLIC",
      "isLocked": false,
      "paidEntryCoins": null,
      "roomBackground": { "assetId": null, "url": null, "mimeType": null, "version": 0 },
      "seatStyle": { "assetId": null, "url": null, "mimeType": null, "version": 0 },
      "owner": { "publicId": "USR-123", "name": "Owner", "profileImage": null, "frameUrl": null, "badgeUrl": null }
    }],
    "nextCursor": null
  }
}
```

- Empty history is HTTP 200 with `rooms: []`, `nextCursor: null`; failures use the common error envelope, not an empty list. Malformed pagination is 422.
- Successful authenticated `audio-room:join` records the visit regardless of entry source (list, search, invitation, shared link). REST discovery, token requests and rejected joins do not record visits. There is no client-supplied history-write endpoint.
- One database row per user/room; a revisit updates server time and moves it to the top. Successful reconnects also refresh recency, without creating another history row or entrance effect. History follows the account across devices and app restarts.
- Returns LIVE and IDLE rooms including zero participants. Country query parameters are ignored. Includes the owner's own visited room.
- Excludes blocked/terminated/nonexistent rooms, inactive/deleted owners, active room bans, and joining-paused rooms for non-owners. Expired timed restrictions are reconciled before listing. Deleting a room/user cascades its visit rows.
- Previously visited hidden rooms remain in personal history; this is not public discovery. Password/paid rooms can appear but history is not an admission token: all current password, payment, ban and room-state checks still run on join.
- Artwork is resolved using existing active/ownership/expiry rules; URLs may be refreshed. No passwords or internal user IDs are returned.
- Ordering is latest visit descending, then internal room ID descending for ties. A room revisited during pagination moves to the first page; refresh the first page to see it. Clients should key rows by `roomId`.
- No guessed historical backfill: visits begin after deployment. Records persist until account/room deletion; no automatic retention cutoff is introduced.

Deployment: apply migration `20261013190000_audio_room_visits`, regenerate Prisma Client, build/restart `node server.js`. Deploy migration before restarting because successful joins now write visit history. Mobile should use this endpoint instead of filtering the Home discovery list.
