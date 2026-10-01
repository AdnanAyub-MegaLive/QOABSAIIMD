# Restored-session device metadata

`PUT /api/users/session/device`, authenticated with `Authorization: Bearer <token>`.

```json
{ "deviceId": "installation-id", "platform": "Android", "deviceName": "X6817", "location": "Islamabad, Pakistan" }
```

Returns `{ "success": true, "data": { "updated": true, "seenAt": "2026-10-01T12:00:00.000Z" } }`, or `updated: false`
when metadata is unchanged. Every successful call refreshes the existing
`Device.lastLoginAt` using the server clock and returns that value as `seenAt`.
The Devices table retains one login-time display; no separate activity field exists.
The app triggers the refresh but does not supply or control the timestamp.
Account identity comes exclusively from the verified token.
Bound device IDs must match. Older unbound tokens retain session-status behavior.

Optional fields are trimmed/truncated like login (location 500, deviceName 255,
platform 100). Omitted fields remain unchanged; explicit blank/null values clear
them. IP comes only from the first `x-forwarded-for` entry, then `x-real-ip`;
missing headers preserve an existing IP. Configure the trusted ingress proxy to
overwrite these headers: arbitrary public forwarding headers are not trustworthy.

Existing rows preserve `isBanned`; both new and existing rows receive the current
server timestamp in `lastLoginAt`. Active account/device bans and existing device ban flags deny
sync. This endpoint never clears ban flags, including expired flags awaiting
the existing ban-maintenance process. Each changed row has one audit entry;
unchanged metadata requests only update activity time and do not audit. Serializable transactions retry
concurrent-create/update conflicts.

Errors: 400 `INVALID_JSON`; 401 `INVALID_SESSION`, `SESSION_REVOKED`, or
`DEVICE_MISMATCH`; 403 `ACCOUNT_BANNED`/`DEVICE_BANNED`; 422 `VALIDATION_ERROR`;
429 `RATE_LIMITED` with `Retry-After: 60`; 500 `DEVICE_SYNC_FAILED`.
Rate limit is 10 calls/minute/user using the existing process-local limiter;
multi-instance production deployments need a shared ingress/distributed limit.
Apply all migrations through `20261001140000_device_single_timestamp` and regenerate
Prisma; no mobile token rotation is required. The corrective migration preserves
the newest recorded time in `lastLoginAt` before dropping the redundant activity column.

The custom server overwrites both IP headers using the socket peer for direct
connections. `TRUSTED_PROXY_IPS` is an optional exact-IP allowlist for immediate
reverse proxies; only those peers may supply forwarding headers. Leave it empty
for LAN usage. A trusted proxy must overwrite client-supplied headers. Restart
`node server.js` after updating this setting/code (custom-server changes do not hot reload).

Session status returns 401 only for invalid/expired/revoked sessions or device
mismatch. Database, maintenance and profile-resolution errors return 500
`SESSION_STATUS_FAILED` and are logged server-side rather than forcing logout.
