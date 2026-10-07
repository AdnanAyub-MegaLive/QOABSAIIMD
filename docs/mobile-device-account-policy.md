# Mobile device and session policy

Phone login, registration and Google sign-in require `device.deviceId` (legacy phone routes also accept `macAddress`). Use the same stable installation identifier on all auth and metadata requests.

- One new account may be registered per device: repeat signup returns HTTP 409 `DEVICE_ACCOUNT_CONFLICT`. The account's `signupDeviceId` is permanent for its lifetime and is not changed by login or metadata sync. Logging out does not release it.
- Existing accounts may log in on any non-banned device, including a device used to register another account. Login history does not consume that device's signup allowance. The account still has only one current session version across devices.
- Successful fresh login increments the account's session version, including login on the same device. Older tokens fail with HTTP 401 `SESSION_REVOKED`, including refresh attempts. Refresh preserves the version and cannot revive an older session.
- Existing sockets receive the existing `session:force-logout` event (new sessionVersion and reason), followed by `session:revoked` with the standard error envelope, and disconnect. Clear local authentication, stop room/media playback, and show the login screen; do not automatically log back in with saved credentials.
- New Google accounts reserve their device in the account-creation transaction. Registration and login device writes share a PostgreSQL transaction advisory lock to prevent simultaneous accounts claiming the same identifier. Metadata sync uses the same guard.
- A device identifier is not hardware attestation: reinstall/reset or a modified client may change or copy it. This policy does not claim to identify physical hardware permanently.

Apply migration `20261007190000_signup_device_binding`, regenerate Prisma, and restart `node server.js`. Historical accounts have a null signupDeviceId because past login records cannot reliably identify the original signup device; do not fabricate that association. Backfill only from verified registration evidence if available.
