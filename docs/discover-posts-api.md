# Discover posts API

All routes require `Authorization: Bearer <mobile session token>`.

## List posts

```http
GET /api/posts?cursor=<optional-post-id>
```

Posts are returned newest first in pages of 20. `nextCursor` is `null` on
the last page.

```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "id": "PST-1A2B3C4D",
        "description": "Had an amazing stream today!",
        "imageUrl": "https://portal.example.com/api/posts/PST-1A2B3C4D/image",
        "createdAt": "2026-08-18T10:15:00.000Z",
        "author": {
          "publicId": "USR-2048",
          "fullName": "Ayesha K.",
          "profileImage": null,
          "isOfficial": false,
          "frameUrl": "https://portal.example.com/api/uploads/AST-FRAME/file?displayExp=...&displaySig=...",
          "badgeUrl": null
        }
      }
    ],
    "nextCursor": null
  }
}
```

`author.frameUrl` and `author.badgeUrl` resolve the author's currently
equipped, active frame and badge. Each field is `null` when no applicable
asset is equipped or available. Returned asset URLs are suitable for mobile
display and may be short-lived signed URLs.

## Create a post

```http
POST /api/posts
Content-Type: multipart/form-data
```

Fields:

- `description`: optional text, maximum 5,000 characters.
- `image`: optional JPEG, PNG, or WebP image, maximum 10 MB.

At least one of `description` or `image` is required.
