# Agency photo integration

## Status
Backend fix implemented locally; not pushed/deployed or verified on physical
phones. No migration is required. Existing data and balances were not changed.

## Backend
`AGENCY_ARTWORK` now uses the existing signed display access path. A valid,
unexpired display signature allows fetching an active image without a Bearer
header. Missing/invalid/expired signatures and inactive assets remain rejected;
old media versions return 409 `MEDIA_VERSION_CHANGED`. Other categories retain
their access rules. Preserve the full URL including signature and version query.

`logoUrl` is returned by the shared profile card (own profile), public profile,
agency owner dashboard, and Join Agency listing (`GET /api/agencies`). It is
null without a saved active logo. It is not the owner's avatar, level badge or
card background. Reads resolve the currently saved logo asset. Replacement
creates a new asset URL and a content version; identical bytes may share a version
hash but still have a new asset URL.

No standalone mobile agency-details GET route exists in this checkout. If the
app details screen uses the listing/dashboard object, use its `logoUrl`. If it
uses another endpoint, supply its exact path before claiming details integration
complete. Profile lookup/search detail uses the public-profile agency object.

## Upload
`POST /api/agencies/mine/logo`, existing mobile Bearer authentication.
Multipart fields: `image` (JPEG/PNG/WebP, up to 5 MiB) and `agencyId` (agency
public ID). Always send the selected agency ID explicitly. For compatibility,
one-agency owners may omit it; multiple-agency owners receive 409
`AGENCY_SELECTION_REQUIRED`: "Select the agency whose picture you want to change."

Success HTTP 201:
```json
{"success":true,"data":{"logoUrl":"https://portal.megachat.live/api/uploads/AST-example/file?displayExp=...&displaySig=...&v=..."}}
```
Errors use `{success:false,error:{code,message}}`:
- 422 `VALIDATION_ERROR`: invalid image/selector.
- 413 `FILE_TOO_LARGE`: image exceeds limit.
- 403 `FORBIDDEN`: no owned agency when selection omitted.
- 404 `AGENCY_NOT_FOUND`: selected agency is not owned by caller.
- 409 `AGENCY_SELECTION_REQUIRED`: ambiguous omitted agency.
- 429 `RATE_LIMITED`: at most 10 upload attempts/minute/user.
- Unexpected failure: `AGENCY_LOGO_UPLOAD_FAILED`, generic safe message.
Existing session/device/account failures still apply. Invalid uploads do not
replace the current logo; logo asset creation and agency update are transactional.

## RN / Kotlin work still required
Render agency logos on Join Agency cards, own/public profile agency cards,
owner dashboard and agency details. On upload success invalidate/refetch those
agency caches. Do not strip signed parameters or substitute the owner photo.

Upload failure: popup title **Agency photo upload failed**, readable backend
`error.message` or safe network fallback, **Retry / Cancel**. Preserve the previous
photo and do not show success.

Upload succeeded but image failed: **Your photo was uploaded, but it couldn't be
displayed. Please retry loading it.** Actions **Retry loading / Close**. Retry
refreshes agency data and loads the latest URL; it must not upload again.

Show each popup once per user-triggered attempt, not on every recomposition.
Passive browsing uses fallback artwork and a retry affordance, not repeated alerts.

## Release acceptance
Upload and replace a dedicated QA agency logo; fetch its signed URL without
authorization and verify image bytes. Verify all four screens use the new logo,
including app restart. Test invalid/expired signatures, inactive assets and old
versions. Test offline/invalid/oversized upload, ambiguous agency selection,
non-owner access, rate limits and server failures. Confirm prior-photo retention,
single popup per attempt and loading retry without a second upload.
