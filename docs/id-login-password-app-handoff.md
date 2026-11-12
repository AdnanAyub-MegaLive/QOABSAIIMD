# Spec 213: ID login and password setup

Deploy before enabling this backend flow. Both legacy and v1 routes share the implementation. Existing phone-only login requests are supported.

## Login

`POST /api/users/login` or `/api/v1/auth/login`:

```json
{
  "identifier": "2030146",
  "phone": "2030146",
  "password": "your-password",
  "device": { "deviceId": "stable-installation-id", "location": "Pakistan", "platform": "Android" }
}
```

The existing device payload remains required. A nonempty identifier takes precedence over phone. Resolution is exact active, unrevoked, currently valid special ID (case-insensitive), then exact public ID / numeric normal ID aliases (`2030146`, `USR-2030146`, `TLN-2030146`), then normalized phone. An exact public ID wins over aliases. Ambiguous numeric aliases are refused. If an earlier match has no password or the password is wrong, the server does not try a different account.

Missing/deleted accounts, missing passwords and wrong passwords all return HTTP 401:

```json
{ "success": false, "error": { "code": "INVALID_CREDENTIALS", "message": "ID or password is incorrect." } }
```

Device policy, bans, successful-login auditing and single-session replacement behavior remain. User data in password and Google login now includes `hasPassword`.

## Password state

`GET /api/v1/users/me/connections` includes `data.hasPassword` independently of `phoneConnected`. A Google-only account with a password has `hasPassword: true` and `phoneConnected: false`.

## Set / change

Authenticated `POST /api/users/password` or `/api/v1/auth/password`:

First password: `{ "newPassword": "your-new-password" }`.

Existing password: `{ "currentPassword": "your-current-password", "newPassword": "your-new-password" }`.

New passwords must be 8–128 characters. Existing passwords require the current password and reject an unchanged replacement. The server rechecks password state under an account lock; simultaneous first-password requests cannot overwrite each other. First setup audits `PASSWORD_SET`; subsequent changes retain `USER_PASSWORD_CHANGED`.

Success:

```json
{ "success": true, "data": { "passwordChanged": true, "passwordSet": true, "hasPassword": true, "changedAt": "2026-11-12T00:00:00.000Z" } }
```

`passwordSet` is false for subsequent changes. Refresh connections or update local `hasPassword` after success. **The previous password endpoint preserved sessions; this behavior is unchanged.** It does not emit `PASSWORD_RESET` or revoke other sessions. A new login still replaces older mobile sessions as before.

## Limits

Database-backed limits survive process restarts and are shared across workers: login allows 10 attempts per 15 minutes per normalized identifier, device, observed IP and resolved account. Limits count all attempts, including successful attempts, to bound concurrent guesses. Normal-ID aliases share a bucket and all account aliases also share the account bucket. Password setup/change allows 5 attempts per account per hour. Existing v1 per-minute limits still apply. An unavailable/loopback IP is not treated as a shared client IP bucket; identifier, device and account limits still apply. For direct Nginx-to-Node deployment, configure `TRUSTED_PROXY_IPS` with only the actual immediate proxy addresses (normally `127.0.0.1,::1`) and ensure Nginx overwrites forwarding headers, so the server can observe real client IPs.

On HTTP 429 (`RATE_LIMITED`), show the server message and honor `Retry-After`. Identifier/device/IP bucket values are stored as SHA-256 digests, not plaintext. Expired buckets are cleaned in bounded batches.

## Deployment and QA

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh
```

Deployment applies `20261112120000_auth_attempt_buckets` before starting the app. Do not skip migrations.

Verify Google-only first setup without phone; ID/password login from a second device; active vs expired special IDs; subsequent password changes with missing/wrong/correct current password; legacy phone login; banned account/device behavior; and rate limiting. No event template republish is needed.
