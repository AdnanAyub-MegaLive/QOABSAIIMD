# Partner Store API (v1)

Read-only API for an approved partner web store. It returns Mall items with a name and protected preview media only. Original media files are never served.

## Authentication

- Every request to `/api/partner/v1/items*` must send the partner key in the `X-Partner-Key` header.
- Call the API **server-to-server only**. Never put the key in browser code, mobile apps or public repositories.
- Keys are created and revoked by Portal staff. The full key is shown once at creation; the Portal stores only a SHA-256 hash.
- A revoked key stops working within about 5 seconds on every server instance (each instance caches valid keys for up to 5 s).
- The JSON endpoints are server-to-server only: they send no CORS headers and cannot be called from browser JavaScript.

## Endpoints

### `GET /api/partner/v1/items`

| Query | Default | Notes |
|---|---|---|
| `limit` | 20 | 1–50. Values above 50 are capped to 50. |
| `cursor` | – | Opaque value from the previous page's `nextCursor`. |
| `updatedSince` | – | ISO 8601 date-time. Returns only items changed at or after this time. |
| `removedCursor` | – | Continues the `removed` list (needs `updatedSince`). |

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "AST-7F3K",
        "name": "Golden Phoenix Frame",
        "media": {
          "image": "https://<portal>/api/partner/v1/media/AST-7F3K/image?exp=…&key=…&sig=…",
          "motion": "https://<portal>/api/partner/v1/media/AST-7F3K/motion?exp=…&key=…&sig=…"
        }
      }
    ],
    "nextCursor": "eyJ…",
    "removed": ["AST-1A2B"],
    "removedCursor": null,
    "removedTruncated": false
  }
}
```

- `media.motion` is present only for animated items with a motion preview source.
- Items are ordered by last change time, oldest first. Keep requesting with `cursor=<nextCursor>` until `nextCursor` is `null`.
- Incremental sync: store the time you started your last sync and pass it as `updatedSince` next time (keep using `cursor` for further pages).
- With `updatedSince`, the first page (no `cursor`) also contains `removed`: ids of items that left the Mall (hidden, archived, deactivated or deleted) at or after that time. Remove them from your store.
- `removed` holds at most 1000 ids. Removals are paged separately from items: page items with `cursor` until `nextCursor` is `null`, and independently page removals by repeating the request with the same `updatedSince` plus `removedCursor=<removedCursor>` until `removedTruncated` is `false`. Item pages requested with `cursor` but without `removedCursor` do not include `removed`.
- Items win over removed: an item that left and re-entered the Mall appears in `items` and is not listed in `removed`.
- Removal records are kept for 90 days. If `updatedSince` is older than that, the response has `fullSyncRequired: true` and no `removed`; run a full sync (no `updatedSince`) and replace your catalog. A 404 from the single-item endpoint also means the item is gone.

### `GET /api/partner/v1/items/{id}`

Returns one item in the same shape (`data` is the item). Use it to refresh media links for a single item. `404 NOT_FOUND` means the item is not (or no longer) in the Mall.

## Caching and ETag

- Responses carry an `ETag`. Send it back as `If-None-Match`; you get `304 Not Modified` with no body when nothing changed.
- The ETag also changes when the media links are re-signed (every 5 minutes), so a 304 always means your stored links are still valid.
- Catalog data is cached on the Portal for up to 30 seconds.

## Media links

- `image`: WebP poster, at most 512 px on the longest side.
- `motion`: short preview (about 3 s, at most 480 px). MP4 items return an H.264 MP4 without audio; GIF items return an animated WebP.
- Links are signed, bound to your key and expire in 10–15 minutes. Refresh them by calling the list or single-item endpoint again. Expired or modified links return `403 INVALID_SIGNATURE`.
- Website origins are hotlink protection only, not access control. If your key has website origins configured, media is served only when the browser's `Origin` or `Referer` matches one of them. If the list is empty, media is served to any website.
- `Referrer-Policy: no-referrer` on your pages breaks the website check (media returns 403). The default `strict-origin-when-cross-origin` works.
- When the request `Origin` matches an allowed origin, media responses include `Access-Control-Allow-Origin: <that origin>` and `Vary: Origin`, so `crossorigin` images and video work.
- The first request for a new or changed item may take a few seconds while the preview is generated. `404` means no preview could be produced for that item.

## Rate limits

- 60 requests per minute per key for the items endpoints.
- 120 requests per minute per client IP for the items endpoints (checked before the key).
- 600 media requests per minute per key.
- Exceeding a limit returns `429 RATE_LIMITED` with `Retry-After: 60`.

## Errors

All errors are JSON: `{ "success": false, "error": { "code": "…", "message": "…" } }`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad `limit` or `updatedSince`, or `removedCursor` without `updatedSince`. |
| 400 | `INVALID_CURSOR` | `cursor` or `removedCursor` is malformed. Restart paging without it. |
| 401 | `UNAUTHORIZED` | Missing, invalid or revoked key. |
| 403 | `INVALID_SIGNATURE` | Media link expired, tampered with, or its key was revoked. |
| 403 | `ORIGIN_NOT_ALLOWED` | Media requested from a website that is not allowed. |
| 404 | `NOT_FOUND` | Item or preview not available. |
| 503 | `PREVIEW_BUSY` | Previews are being generated; retry after `Retry-After` seconds. |
| 429 | `RATE_LIMITED` | Too many requests (per key or per IP). |
| 500 | `SERVER_MISCONFIGURED` | Portal media settings are missing; contact the Portal team. |
| 500 | `PARTNER_REQUEST_FAILED` | Temporary server error; retry later. |

## Server configuration (Portal operators)

- `PARTNER_MEDIA_SECRET` is required in production for signing media links (fails closed). Outside production, `AUTH_SECRET` is used if it is missing.
- `PARTNER_MEDIA_BASE_URL` is required in production (e.g. `https://portal.example.com`); media links are never built from request Host headers in production.
- `FFMPEG_PATH` is optional; without ffmpeg, MP4 items have no motion preview.
