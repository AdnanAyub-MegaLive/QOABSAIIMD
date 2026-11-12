# Spec 211 — Help Center

Portal editor: `/help-center`, permission `help_center.manage`. Super Admin has access; grant this permission explicitly to other editors. FAQs, Guides, Safety, Policies and Settings support publishing, translations, reordering, image uploads and audited changes.

## Mobile integration

`GET /api/v1/help-center?lang=en` is public; Bearer authentication is not required. The response is `{ success: true, data: { updatedAt, supportEmail, termsUrl, privacyUrl, liveChat: { enabled, hours }, faqs, guides, safety, policies } }` using the fields in Spec 211. Safety is null when no published article exists. Icon URLs are absolute. Content is plain text, retaining newlines.

Only published content is returned. Each unavailable translation falls back to its English slug. Cache the last successful response for offline use and retain the built-in app fallback before the first successful response. Send the returned ETag in `If-None-Match`; on 304 reuse the cached body. Cache-Control allows five minutes. Hide Live Chat when disabled. No socket refresh event is implemented.

## Deployment and exact-content import

The migration creates the tables. The exact `Mega/document/help_center_seed.json` was not available in the current checkout or searched local repositories, so original app content has **not** been imported. Do not replace it with invented text. Before initialization the public endpoint returns 503, allowing the app to retain its built-in content.

Deploy the code on the Droplet:

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh
```

Once the exact seed file is on the Droplet, import it with an existing authorized administrator's email:

```bash
cd /root/apps/QOABSAIIMD
node scripts/seed-help-center.mjs /absolute/path/help_center_seed.json admin@example.com
```

The importer validates content before writing, imports in one transaction, records audit entries, and marks completion. Re-running it does not repeat the import; existing Portal entries and settings are never overwritten. It accepts an `entries` array or the FAQ/guide/safety/policy response layout. If the actual seed has another structure, adapt its mapping while preserving the original wording before importing.

Verify the endpoint returns the expected 13 FAQs, 5 guides, Safety article and 3 policies after import. Test an English fallback translation, unpublished entry, edited settings, an icon upload and an ETag/304 request. Edits can take up to five minutes to appear in clients respecting the cache.
