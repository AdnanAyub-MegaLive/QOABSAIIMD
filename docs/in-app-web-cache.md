# In-app web caching (113)

No app API or wallet changes. Deploy the build and restart the custom `server.js`
process to enable final HTML/data cache headers.

| Resource | Policy |
| --- | --- |
| Next content-hashed JS/CSS/fonts/images | `public, max-age=31536000, immutable` (Next native) |
| Published event assets under `/event/<slug>/_v/<version>/...` | Same immutable policy, plus SHA-256 ETag / 304 |
| Event HTML and JSON | `no-cache` |
| Portal HTML, RSC and API JSON through custom server | `private, no-cache, must-revalidate`, unless already `no-store` |
| Authentication, private media and other existing no-store responses | Existing stricter policy retained |
| Stable/unversioned event assets and `/games/...` public files | Revalidate, never immutable |

Event entry links remain unchanged. HTML redirects to the current publication's
versioned directory; relative assets resolve there automatically. Refreshing an
old version's HTML redirects to the current version. Only the currently published
version's files are served; guessed draft versions and unpublished events are refused.
Already cached public assets cannot be remotely recalled.

Event authors should use relative asset paths, including CSS URLs and JS imports.
Absolute unversioned links still work but revalidate. Republishing changed files
must use a new event version, not overwrite an existing version folder.

Pizza pepper and Roulette wheel now use static imports producing hashed build URLs.
Uploaded public media/CDN files retain the existing media-version caching contract.
Private media is not made public by these changes.

For RN/Kotlin verification after deployment:

1. Open the page twice; hashed JS/CSS/images should use the browser disk cache.
2. Refresh: HTML and API requests must reach/revalidate with the server.
3. Publish a new event version: refresh loads the new directory and new assets.
4. Conditional event asset GET with its ETag returns 304 and no body.
5. Check responses at the public hostname, not just Node: Nginx/CDN rules may
   override origin headers. Do not add a blanket immutable rule for `/api/`.
6. Keep WebView navigation on the same approved origin; allow the `_v/<version>`
   subpath beneath the event slug. Existing session handshake is unchanged.

Third-party game hosts are outside this server's control. Ask each provider to
serve content-hashed static files with one-year immutable caching, and HTML/data
with no-cache (or private no-store for sensitive data). Do not cache live balances
or transactions offline. Browser/OS cache eviction remains possible; headers
enable reuse, not guaranteed permanent on-device storage.
