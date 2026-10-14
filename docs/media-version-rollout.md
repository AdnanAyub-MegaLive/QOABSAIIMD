# Media versions (§81)

UploadAsset media and posters have independent SHA-256 content versions (first
16 hexadecimal characters). Application Prisma writes derive these from the
saved bytes and invalidate old CDN redirects when bytes are replaced. Changes
to names, prices or signing expiry do not alter the content version.

Mobile response delivery, gift outbox delivery, room join/seat/entrance payloads
and equipped props carry `v` on portal upload URLs. Generic media objects expose
`mediaVersion`; poster objects expose `posterMediaVersion`. Named identity fields
use corresponding names such as `frameMediaVersion` and `badgeMediaVersion`.
CDN URLs retain their immutable hash paths. Profile covers are separate from
UploadAsset and use their existing revision in `v`; room covers already do so.

## Deployment

Back up the database, deploy code and run the additive migration before starting
the new application. Regenerate Prisma and rebuild as usual. Then run:

```sh
node scripts/backfill-media-versions.mjs
node scripts/backfill-media-versions.mjs --apply
```

The first command is a dry run. The second updates only media version metadata,
preserves updatedAt and skips rows replaced concurrently. Rerun if conflicts are
reported. Neither command modifies wallets, awards, ownership or media bytes.
Without this backfill, legacy rows can still have null versions.

## Cache and security

- Authentication/signature validation happens before conditional 304 responses.
- `v` is not signed. A requested version that differs from stored bytes returns
  409 `MEDIA_VERSION_CHANGED`; refetch the catalogue/profile rather than caching
  replacement bytes against an old version.
- Public catalogue artwork with a matching `v` receives a one-year immutable
  policy and a quoted version ETag. Private media remains private/revalidated.
- CDN redirects are deliberately not cached, so a redirect cannot bypass later
  authorization checks. The destination content has immutable caching.
- Spaces provides its own object ETag, not the portal's 16-character ETag.
- Public `application/svga` media supports `.svga` content-addressed CDN keys.
  This does not relax upload validation or enable unvalidated SVGA uploads.

## Catalogue invalidation

`GET /api/gifts/catalog` includes `data.catalogVersion`. Admin upload edits,
creation/deletion and live gift management emit `gifts:catalog-updated` with
`{ catalogVersion }`. Refetch when it differs and on reconnect. Notification
failure is logged without reporting an already committed upload as failed.

## Device verification

New shared audio gifts are public catalogue artwork automatically; live gifts
already use the same policy. Prices and VIP sending restrictions are unchanged.
Editing a gift's price preserves its visibility. Assignment-only media is not
promoted by the retry worker. Public asset edits trigger CDN mirroring too.

The server checks pending CDN links every minute (20 metadata rows / at most five
publication attempts per pass, without overlapping passes). Failed uploads keep
their database originals and are retried on later passes, including after restart.
Both media and poster CDN links include their own content hash in `v`, preserving
the production cache-header repair for future uploads and sync runs. No schema
migration is needed for this automation; rebuild and restart the portal.

Once artwork has been public, making it private cannot recall copies already
downloaded or cached. Do not upload confidential material as public artwork.

Verify repeated sends and restarts reuse cached bytes; replacing animation or
poster downloads only the changed version. Verify expired signed requests are
denied even with a matching ETag. Phone-side download counts and cache eviction
require mobile testing; server tests cannot prove those client behaviors.

## SVGA uploads

Audio gifts, live-video gifts, frames, entrances, rides, badges, chat boxes,
VIP stickers and campaign widgets accept `.svga` files. Image/video-only
categories (including room backgrounds, seat styles and profile artwork) retain
their existing contracts. SVG is a different format and is not enabled here.

- Uploads use `file`; an optional `posterFile` accepts static PNG/JPEG/WebP up to
  5 MiB. Posters are decoded, resized within 1024 × 1024 and re-encoded to WebP
  without metadata. The UI displays a poster or SVGA placeholder, not an unsafe
  browser animation runtime. Actual animation playback remains in the app.
- Canonical MIME is `application/svga`, including when a browser supplies an empty
  or generic MIME for a `.svga` filename. Extension alone never proves validity.
- Both SVGA 1.x ZIP/JSON and 2.x zlib/protobuf (also ZIP movie.binary) are validated.
  Original validated animation bytes are retained. Embedded audio is rejected:
  export a silent animation, matching the mobile player's current behavior.
- Limits: 8 MiB input, 16 MiB expanded archive/binary, 2 MiB JSON, 2048 × 2048
  canvas, 60 FPS, 30 seconds/1800 frames, 128 sprites/resources, 40,000 total
  sprite frames, 20,000 shapes, 2 MiB combined vector paths and 16 megapixels
  total decoded raster resources. Each raster is static PNG/JPEG/WebP within
  2048 × 2048. External image references, SVG, unsafe archive names, duplicate
  entries, symbolic links, encryption, corrupt checksums and unsupported fields
  are rejected. Files are never extracted to disk or executed.
- Permission checks precede bounded multipart parsing. Admin uploads are limited
  to 20/minute per admin; at most two SVGA validations run concurrently per process.
  `429` includes `Retry-After`. These controls complement proxy request limits.
- Main and poster bytes use independent `mediaVersion`/`posterMediaVersion` values
  and `v` URLs. Shared gifts automatically mirror to the existing content-addressed
  `.svga` CDN path, with `application/svga` and one-year immutable caching. Failures
  retain the database original and use the existing background retry mechanism.
  Private assignments, private music and KYC are never promoted to the public CDN.
- Gift events and live/backpack catalogues include optional `posterUrl`,
  `posterMimeType` and `posterMediaVersion`. Existing gift charging, XP, ownership
  and delivery permissions are unchanged.

This addition needs no schema migration or historical backfill. Rebuild/restart
after deploying; it does not revalidate historical uploads. Requires the existing
Node 24 runtime (uses built-in ZIP CRC32 validation).

Phone checks: test a valid SVGA 1 and 2 animation with and without a poster, repeat
a gift and restart the app to confirm cache reuse, then replace the animation and
poster separately to confirm independent invalidation. Verify both Android and
iOS; server tests do not establish on-device rendering compatibility. Keep the
mobile player's pinned dependencies, download bounds and watchdog in place.
