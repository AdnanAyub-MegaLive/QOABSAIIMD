# Restored-session device metadata

`PUT /api/users/session/device`, authenticated with `Authorization: Bearer <token>`.

```json
{ "deviceId": "installation-id", "platform": "Android", "deviceName": "X6817", "location": "Islamabad, Pakistan" }
```

Returns `{ "success": true, "data": { "updated": true, "seenAt": "2026-10-01T12:00:00.000Z" } }`, or `updated: false`
when metadata is unchanged. Every successful call writes server-clock `Device.lastActiveAt`
and returns it as `seenAt`; the Devices table shows this as Last active separately
from Last login (falling back to actual login time for older rows).
Account identity comes exclusively from the verified token.
Bound device IDs must match. Older unbound tokens retain session-status behavior.

Optional fields are trimmed/truncated like login (location 500, deviceName 255,
platform 100). Omitted fields remain unchanged; explicit blank/null values clear
them. IP comes only from the first `x-forwarded-for` entry, then `x-real-ip`;
missing headers preserve an existing IP. Configure the trusted ingress proxy to
overwrite these headers: arbitrary public forwarding headers are not trustworthy.

Existing rows preserve `lastLoginAt` and `isBanned`. New rows have no fabricated
login timestamp. Active account/device bans and existing device ban flags deny
sync. This endpoint never clears ban flags, including expired flags awaiting
the existing ban-maintenance process. Each changed row has one audit entry;
unchanged metadata requests only update activity time and do not audit. Serializable transactions retry
concurrent-create/update conflicts.

Errors: 400 `INVALID_JSON`; 401 `INVALID_SESSION`, `SESSION_REVOKED`, or
`DEVICE_MISMATCH`; 403 `ACCOUNT_BANNED`/`DEVICE_BANNED`; 422 `VALIDATION_ERROR`;
429 `RATE_LIMITED` with `Retry-After: 60`; 500 `DEVICE_SYNC_FAILED`.
Rate limit is 10 calls/minute/user using the existing process-local limiter;
multi-instance production deployments need a shared ingress/distributed limit.
Apply migration `20261001130000_device_last_active` and regenerate Prisma; no mobile token rotation is required.

The custom server overwrites both IP headers using the socket peer for direct
connections. `TRUSTED_PROXY_IPS` is an optional exact-IP allowlist for immediate
reverse proxies; only those peers may supply forwarding headers. Leave it empty
for LAN usage. A trusted proxy must overwrite client-supplied headers. Restart
`node server.js` after updating this setting/code (custom-server changes do not hot reload).

Session status returns 401 only for invalid/expired/revoked sessions or device
mismatch. Database, maintenance and profile-resolution errors return 500
`SESSION_STATUS_FAILED` and are logged server-side rather than forcing logout.
