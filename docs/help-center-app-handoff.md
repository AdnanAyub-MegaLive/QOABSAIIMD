# Spec 211 — Help Center

Portal editor: `/help-center`, permission `help_center.manage`. Super Admin has access; grant this permission explicitly to other editors. FAQs, Guides, Safety, Policies and Settings support publishing, translations, reordering, image uploads and audited changes.

## Mobile integration

`GET /api/v1/help-center?lang=en` is public; Bearer authentication is not required. The response is `{ success: true, data: { updatedAt, supportEmail, termsUrl, privacyUrl, liveChat: { enabled, hours }, faqs, guides, safety, policies } }` using the fields in Spec 211. Safety is null when no published article exists. Icon URLs are absolute. Content is plain text, retaining newlines.

Only published content is returned. Each unavailable translation falls back to its English slug. Cache the last successful response for offline use and retain the built-in app fallback before the first successful response. Send the returned ETag in `If-None-Match`; on 304 reuse the cached body. Cache-Control allows five minutes. Hide Live Chat when disabled. No socket refresh event is implemented.

## Deployment and exact-content import

The migration creates the tables. `prisma/help_center_seed.json` contains the original Kotlin content supplied by the owner: 13 FAQs, 5 guides, Safety and 3 policies. Deployment imports it once, preserving existing Portal edits. Audit entries identify the automated deployment import; no administrator is impersonated. Before initialization the public endpoint returns 503, allowing the app to retain its built-in content.

The original source date, 29 October 2026, is recorded in the seed. The API's `updatedAt` reflects the actual import or latest edit, as required by the API contract. Support email and link settings use the supplied Spec 211 defaults; the pasted Kotlin content did not contain these settings.

Deploy the code on the Droplet:

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh
```

No separate import command is needed with `deploy-droplet.sh`. If deploying another way, after applying migrations and generating Prisma, run:

```bash
cd /root/apps/QOABSAIIMD
node scripts/seed-help-center.mjs --bundled
```

The importer validates content before writing, imports in one transaction, records audit entries, and marks completion. Re-running it does not repeat the import; existing Portal entries and settings are never overwritten. For a manual custom import, it also accepts `node scripts/seed-help-center.mjs /absolute/path/help_center_seed.json admin@example.com` with an authorized administrator.

Verify the endpoint returns the expected 13 FAQs, 5 guides, Safety article and 3 policies after import. Test an English fallback translation, unpublished entry, edited settings, an icon upload and an ETag/304 request. Edits can take up to five minutes to appear in clients respecting the cache.
