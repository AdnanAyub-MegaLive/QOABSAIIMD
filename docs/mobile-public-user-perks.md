# Public user perk fields

Public user objects returned by search, conversations, and audio-room features
include resolved display assets:

```json
{
  "publicId": "USR-2048",
  "name": "Rafia Khan",
  "profileImage": "https://cdn.example.com/profiles/rafia.jpg",
  "frameUrl": "https://portal.example.com/api/uploads/AST-FRAME/file?displayExp=...&displaySig=...",
  "badgeUrl": "https://portal.example.com/api/uploads/AST-BADGE/file?displayExp=...&displaySig=..."
}
```

Resolution is consistent across endpoints:

1. Newest active assignment for that user.
2. Newest global asset in that category.
3. `null` when neither exists.

Expired assignments are ignored. Display URLs expire after one hour and are
restricted to frames, badges, and room backgrounds.

Included locations:

- `GET /api/users/search`: `frameUrl`, `badgeUrl`
- `GET /api/conversations`: direct `participant.frameUrl` and `badgeUrl`
- Message REST/socket payloads: `senderFrameUrl`, `senderBadgeUrl`
- `GET /api/audio-rooms/discover`: owner frame/badge and
  `roomBackgroundUrl`
- `GET/POST /api/audio-rooms`: the owner's `roomBackgroundUrl`
- Socket room join: owner frame/badge and room background
- Socket seat sync/request/update payloads: participant/requester frame and
  badge fields
