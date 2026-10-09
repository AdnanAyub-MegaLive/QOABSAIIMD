# Mobile avatar upload

`POST /api/v1/users/me/avatar` requires the existing Bearer mobile session.
Send multipart/form-data containing exactly one `image` file (JPEG, PNG or WebP,
maximum 5 MiB). Do not manually set the multipart boundary in the app.

Returns HTTP 201: `{ "success": true, "data": { "profileImage": "https://portal.megachat.live/api/uploads/AVATAR-.../file?..." } }`.
The display URL is signed for 30 days and does not need an Authorization header.
Images are decoded, orientation-corrected, resized within 1600x1600 and re-encoded
as WebP with metadata removed. Animated images and MIME/content mismatches are rejected.

Authentication precedes body parsing. Uploads are limited to 10/minute per user
per portal process, using the existing limiter (shared rate limiting is required
before deploying multiple workers). Responses preserve v1 headers and request ID.
Errors: 401 session errors, 403 device bans, 422 VALIDATION_ERROR,
413 FILE_TOO_LARGE, 429 RATE_LIMITED (Retry-After), 500 AVATAR_UPLOAD_FAILED.

Asset bytes, ownership assignment, previous-avatar history and the new profile
picture commit together in one transaction with the user's row locked.
History retains up to the configured maximum (capped at 20); pruning removes
history records only, not uploaded/shared assets. No schema change is needed.

## App integration

Onboarding must upload the photo here, then PATCH other profile fields through
`/api/v1/users/me`. Never send base64/data/device URIs in that PATCH. Show errors
instead of swallowing them. Use the returned URL and refresh the profile/history.
The upload already equips the picture; a second picture PATCH is unnecessary.

## Production rollout

Deploy the changed source to the Droplet, install with `npm ci`, build with
`npm run build`, and restart the existing portal process so it uses the new build.
Preserve production `.env.local`; AUTH_SECRET and MOBILE_API_BASE_URL must be set.
Configure proxy request limits to allow 5 MiB plus multipart overhead (e.g. 6 MiB).
Do not build into a directory being used by a running development server.

Verify unauthenticated POST returns JSON 401 rather than HTML 404. With a test
account upload a valid image, fetch its signed URL without a token, and confirm
the previous image appears in history and the new one does not. Test malformed
content, oversize, banned/revoked sessions and rate limiting before rollout.
