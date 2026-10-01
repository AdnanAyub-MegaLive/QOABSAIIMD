# Mobile user search API

## Search users

```http
GET /api/users/search?q=<query>
Authorization: Bearer <sessionToken>
```

`q` is matched case-insensitively as a partial value against both the public
user ID and display name. The authenticated caller is excluded. Deleted
accounts are excluded and the response is capped at 20 users.

An empty or whitespace-only query returns a successful empty list.

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "publicId": "USR-2048",
        "name": "Sarah Jenkins",
        "profileImage": "https://cdn.example.com/profiles/sarah.jpg",
        "frameUrl": "https://portal.example.com/api/uploads/AST-FRAME/file?displayExp=...&displaySig=...",
        "badgeUrl": null
      }
    ]
  }
}
```

Only `publicId`, `name`, `profileImage`, `frameUrl`, and `badgeUrl` are exposed. Private account,
contact, financial, session, and onboarding fields are never returned.
Perks resolve active user-specific assignments first, then the newest global
asset in that category. Missing perks are returned as `null`.

Example:

```js
const response = await fetch(
  `${API_BASE_URL}/api/users/search?q=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${sessionToken}` } },
);
const result = await response.json();
return result.data?.users ?? [];
```
