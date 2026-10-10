# Spaces CDN and mobile cache handoff

## Implemented portal scope

Public catalogue artwork is mirrored to the SGP1 `megalive-space` bucket and served through `https://media.megachat.live`. New Uploads submissions and live-gift artwork trigger mirroring after database commit. Mirroring failure is logged and the existing database original remains usable. The migration script handles old assets and retries failures. This rollout intentionally retains original database bytes; it does not reduce database storage yet.

Eligible assets must be active, global or store-visible, not room-private, in an approved artwork category, and PNG/JPEG/WebP/GIF/MP4. Files get a SHA-256 content-derived key and correct MIME, extension and cache metadata. Posters have independent keys. Never overwrite an existing key with different content.

Not moved: KYC/documents, private music, private assignments, avatars, pending custom backgrounds, event archives, room/video covers stored outside UploadAsset, SVG/SVGA, and other restricted data. These keep their existing protected paths. SVG/SVGA publication needs a separate sanitization/complexity-validation review; do not widen this allowlist blindly.

Catalog DTOs retain `url`, `mimeType`, `posterUrl`, `posterMimeType`, `updatedAt`, and add `cacheKey`. Mirrored public entries return the CDN URL directly. Gift/perk payloads that still use portal signed URLs remain compatible: the file endpoint checks existing authorization then redirects to the public CDN. It no longer reads database file bytes on that fast path. Catalogue ETags change when CDN links are added or the rollout switch changes.

## Configure and deploy

1. Create a **Spaces** access key scoped to this bucket with object read/write permission. A DigitalOcean account API token is not a substitute. Keep bucket listing private. Public artwork objects are individually `public-read`.
2. Set these server environment entries; never put either credential in the app or in Git:

   ```dotenv
   MEDIA_CDN_ENABLED=true
   MEDIA_CDN_BASE_URL=https://media.megachat.live
   SPACES_ENDPOINT=https://sgp1.digitaloceanspaces.com
   SPACES_BUCKET=megalive-space
   SPACES_ACCESS_KEY_ID=<bucket-scoped-key>
   SPACES_SECRET_ACCESS_KEY=<bucket-scoped-secret>
   ```

3. Deploy dependencies and schema, then rebuild and restart the existing process:

   ```sh
   npm ci
   npx prisma migrate deploy
   npx prisma generate
   npm run build
   pm2 restart megalive-portal --update-env
   ```

4. Inspect the existing media migration, then copy eligible artwork:

   ```sh
   node scripts/sync-media-cdn.mjs
   node scripts/sync-media-cdn.mjs --apply
   ```

   Default mode is dry-run. Apply is sequential/bounded-memory. It never deletes database originals or bucket objects. Reruns skip rows with a CDN link; `--apply --force` re-uploads eligible linked assets if objects were removed or headers need repair. Partial failures return a nonzero exit status. Do not run against the wrong database/environment.

5. Verify a new Uploads submission gets a CDN URL and the object returns 200 with correct Content-Type, Range support for MP4, and `Cache-Control: public, max-age=86400, immutable`. Confirm a catalogue GET returns the new URL, a gift signed URL redirects successfully, and private assets remain protected.
6. Add a scheduled retry invocation of the sync script if needed; no recurring job is installed by this change.

## CDN / Cloudflare configuration

The tested domain returns Cloudflare headers in front of Spaces. Ensure bots/challenge rules do not challenge native media GET/HEAD requests. Either use DNS-only mode for the DigitalOcean custom CDN CNAME, or explicitly configure and test the extra proxy layer. Do not modify the existing DNS without checking TLS/custom-domain setup.

For browser/WebView fetches, configure Spaces CORS for the actual web origins, GET/HEAD, and expose ETag, Content-Length, Content-Type, Accept-Ranges, Content-Range. Do not grant public write access or allow client uploads using server credentials. Native HTTP players do not normally need browser CORS, but WebView fetch does.

Use versioned public URLs, not rotating S3 presigned URLs for public art. DigitalOcean documents that presigned URLs do not obtain its CDN caching benefit: https://docs.digitalocean.com/products/spaces/how-to/manage-cdn-cache/

## Required mobile implementation (not implemented in this portal repository)

Build one media-cache service shared by gift pickers/effects, banners, props and images:

1. Refresh authenticated catalogue/entitlement data normally. Media bytes are not proof of ownership. Never let a cached asset bypass expired props, bans or moderation.
2. Use `cacheKey` where supplied; otherwise the versioned CDN URL. For legacy signed URLs use asset ID + server content/version metadata, not the changing signature. Keep account/placement indices separate. Do not strip query parameters from arbitrary URLs and assume they identify the same resource.
3. Look up the local file first. If missing, download over HTTPS to a temporary file, enforce existing format/size/time limits, validate response MIME and length, then atomically rename it into the cache. Deduplicate concurrent downloads of the same key. Delete failed/incomplete temporary files.
4. Pass local file paths to supported Image/video/SVGA renderers. Do not base64-encode MP4 or pass portal credentials into media WebViews. Follow redirects without forwarding Authorization to the CDN. Public CDN URLs require no portal token.
5. Prefetch visible posters and the next few banners only. Download large effects on selection/use; restrict background downloads on mobile data. Use bounded concurrency (e.g. 2) and bounded retries with backoff.
6. Use an LRU disk budget (proposal: 200 MiB, configurable in app), honour low disk space, avoid deleting a currently-playing file. Re-download if the OS evicts cache. Clearing app data/uninstall necessarily removes app-owned cache; do not promise persistence through those actions.
7. On logout, clear private/account-scoped references and private cached media. Public shared artwork may remain in a separate public byte cache, but use must be reauthorized on the next session.
8. Handle HTTP 304 only if a valid cached catalogue body exists; otherwise retry without If-None-Match. On removed/disabled items, evict their account-visible entries. On a failed download, show bundled placeholder/retry, not a blank permanent state.

## Public-media removal caveat

Public CDN objects are downloadable by anyone holding the URL, even after entitlement expiry. That is appropriate only for publicly displayed catalogue artwork, not private content. Deactivating an asset stops future portal catalogue/access responses, but does **not** retract already downloaded files or automatically delete/purge CDN objects. For takedowns, delete the specific object and purge both DigitalOcean and Cloudflare caches; direct links may otherwise remain available. Database originals remain for recovery. The app must remove disabled assets from its UI on refresh. Automatic object deletion/purge is a separate operational step, not silently performed here.

## Status

The sample `val-badge.png` returned 200 and image/png. Local schema and mocked tests are separate from a real Spaces upload. Until server credentials are supplied, actual upload/backfill, production deployment, and real-device cache tests remain unverified. No mobile source files were changed.
