# Self-service change-password API

## Endpoint

```http
POST /api/users/password
Authorization: Bearer <sessionToken>
Content-Type: application/json
```

```json
{
  "currentPassword": "CurrentPass#8",
  "newPassword": "NewSecurePass#9"
}
```

The endpoint verifies the authenticated user's current password and stores the
replacement using the same salted scrypt format as registration and login.
The new password must contain 8–128 characters and must differ from the current
password.

This is a self-service change, not an administrator reset. It does not increment
`sessionVersion`, set `forcedLogoutAt`, disconnect sockets, or invalidate the
caller's current mobile session.

## Success

```json
{
  "success": true,
  "data": {
    "passwordChanged": true,
    "changedAt": "2026-07-29T10:00:00.000Z"
  }
}
```

## Errors

- `400 INVALID_JSON` — malformed request body.
- `401 INVALID_SESSION` — invalid, expired, or revoked mobile session.
- `401 CURRENT_PASSWORD_INCORRECT` — current password did not verify.
- `422 VALIDATION_ERROR` — missing current password or invalid new-password
  length; inspect `error.fields`.
- `422 PASSWORD_UNCHANGED` — replacement matches the current password.
- `500 PASSWORD_CHANGE_FAILED` — unexpected database/server failure.

Password values and hashes are never returned or placed in audit-log metadata.
A successful operation stores a `USER_PASSWORD_CHANGED` security audit entry.
