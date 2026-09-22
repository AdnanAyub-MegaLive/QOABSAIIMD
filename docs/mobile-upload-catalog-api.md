# Mobile upload catalogue API

## List available assets

```http
GET /api/uploads/catalog
Authorization: Bearer <sessionToken>
```

The endpoint returns global assets plus assets assigned specifically to the
authenticated user. Assets assigned to other users are never included.

Optional filters for non-banner assets:

- `category=BANNERS|FRAMES|ENTRANCES|RIDES|TAIL_LIGHTS|GIFTS|BADGES|CHAT_BOXES|ROOM_BACKGROUNDS`
- `roomBackground=true` returns only assets enabled for use as room backgrounds.

## Marketing banners

Banners are global marketing content and are never assigned to individual
users or hosts. Banner requests require one of the three placements:
`PARTY`, `HOT_TOP`, or `HOT_MID`.

```http
GET /api/uploads/catalog?category=BANNERS&placement=HOT_TOP
Authorization: Bearer <sessionToken>
```

Missing/invalid placement returns HTTP `422`; the endpoint never falls back to
another placement. A valid empty placement returns `assets: []`, allowing the
app to use its bundled fallback. Results include only active, global banners
and are ordered by `sortOrder`, then `createdAt`, then public ID.

Display the media from `url`. `actionUrl` is optional; when non-null, it is a
normalized HTTPS URL that may be opened in the application's in-app browser.

```json
{
  "id": "AST-A1B2C3D4E5F6",
  "name": "Create your agency",
  "category": "BANNERS",
  "placement": "HOT_TOP",
  "sortOrder": 1,
  "mimeType": "image/webp",
  "url": "https://portal.example.com/api/uploads/AST-A1B2C3D4E5F6/file?uid=USR-1048&sv=0&exp=1784883600&sig=...",
  "actionUrl": "https://portal.example.com/events/agency-drive",
  "updatedAt": "2026-09-21T12:00:00.000Z",
  "isGlobal": true,
  "assignedUsers": []
}
```

The portal includes `/events/agency-drive` as a responsive sample landing page
for testing banner-to-in-app-browser navigation. In production, `actionUrl`
may point to this portal or another valid HTTPS campaign page.

Example:

```http
GET /api/uploads/catalog?category=ROOM_BACKGROUNDS&roomBackground=true
Authorization: Bearer <sessionToken>
```

```json
{
  "success": true,
  "data": {
    "assets": [
      {
        "id": "AST-A1B2C3D4E5F6",
        "name": "Neon Lounge",
        "details": "Animated neon room background.",
        "tags": ["neon", "lounge"],
        "category": "ROOM_BACKGROUNDS",
        "fileName": "neon-lounge.webp",
        "mimeType": "image/webp",
        "fileSize": 248310,
        "url": "https://portal.example.com/api/uploads/AST-A1B2C3D4E5F6/file?uid=USR-1048&sv=0&exp=1784883600&sig=...",
        "actionUrl": null,
        "isGlobal": false,
        "isRoomBackground": true,
        "assignedUsers": [
          {
            "id": "USR-1048",
            "name": "Aisha Khan",
            "profileImage": null,
            "assignedAt": "2026-07-25T08:00:00.000Z",
            "durationMinutes": 10080,
            "expiresAt": "2026-08-01T08:00:00.000Z",
            "isExpired": false
          }
        ],
        "assignedUser": {
          "id": "USR-1048",
          "name": "Aisha Khan",
          "profileImage": null,
          "assignedAt": "2026-07-25T08:00:00.000Z",
          "durationMinutes": 10080,
          "expiresAt": "2026-08-01T08:00:00.000Z",
          "isExpired": false
        },
        "createdAt": "2026-07-24T08:00:00.000Z"
      }
    ]
  }
}
```

One asset may be assigned to multiple users. `assignedUsers` is the complete
assignment list. `assignedUser` remains temporarily as the first assigned user
for compatibility with older app builds; new code should use `assignedUsers`.
Only active, unexpired grants are returned by the mobile catalogue. Once
`expiresAt` is reached, the asset disappears for that user and the file
endpoint rejects access.

## Load the media file

The catalogue now returns a signed URL that React Native can render directly,
without attaching headers to the separate image request:

```js
const source = {
  uri: asset.url,
};
```

Signed URLs are bound to the authenticated user and current session version.
Banner URLs expire after six hours; other catalogue URLs expire after one
hour. Refresh the catalogue to receive a new URL when one expires. Sending the
Bearer token in the file request is still supported. Catalogue responses use
an `ETag`, `Last-Modified` when assets exist, and a 60-second private cache.

Public user payloads may also contain short-lived `frameUrl`, `badgeUrl`, and
`roomBackgroundUrl` display URLs. These use a separate signature restricted to
the `FRAMES`, `BADGES`, and `ROOM_BACKGROUNDS` categories, allowing another
authenticated user's app to render public-facing perks without exposing the
rest of the assignee's upload catalogue.

The hostname in the returned URL is based on the catalogue request. A physical
device must call the API through the computer's LAN address, not `localhost`.
Set `MOBILE_API_BASE_URL` when a fixed externally reachable API origin is
required.

Files are stored in PostgreSQL and streamed with their original MIME type.
The current maximum upload size is 15 MB.
