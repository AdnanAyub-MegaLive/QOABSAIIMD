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
