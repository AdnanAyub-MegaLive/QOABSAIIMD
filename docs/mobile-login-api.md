# Mobile user login API

## Endpoint

`POST /api/users/login`

Every login requires credentials plus current device information. The backend derives the login IP from the HTTP request; the mobile app must send the current location and a stable device identifier.

```json
{
  "phone": "+923001234567",
  "password": "MyPass#8",
  "device": {
    "deviceId": "stable-device-or-installation-id",
    "location": "Lahore, Pakistan",
    "platform": "Android",
    "deviceName": "Pixel 8"
  }
}
```

`device.deviceId` and `device.location` are required. Because recent Android and iOS versions may hide the physical MAC address, send a stable app-installation or device identifier. Do not send `lastLoginIp`; the server obtains it from the connection/proxy headers.

## Successful response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "USR-1048",
      "normalId": "USR-1048",
      "specialId": null,
      "name": "Aisha Khan",
      "phone": "+923001234567",
      "email": "aisha@example.com",
      "country": "Pakistan",
      "profileImage": null,
      "gender": "female",
      "dob": "2001-07-24",
      "role": "LISTENER",
      "status": "ACTIVE",
      "vipLevel": 0
    },
    "login": {
      "ipAddress": "203.0.113.10",
      "macAddress": "stable-device-or-installation-id",
      "location": "Lahore, Pakistan",
      "platform": "Android",
      "deviceName": "Pixel 8",
      "loggedInAt": "2026-07-20T12:00:00.000Z"
    },
    "sessionToken": "...",
    "tokenType": "Bearer",
    "expiresAt": "2026-08-30T12:00:00.000Z",
    "sessionVersion": 0
  }
}
```

Each successful credential check upserts the matching `Device` record, updates the user's last-login time, and writes an authentication audit log. The token is opaque: use `expiresAt` supplied by the server and never decode it or assume a fixed lifetime. A valid banned-user login attempt records the same device/login information but returns HTTP `403` with ban details.

Missing device ID or location returns HTTP `422` with `error.fields`.

## Device-ban enforcement

If the submitted device is banned, login returns HTTP `403`:

```json
{
  "success": false,
  "error": {
    "code": "DEVICE_BANNED",
    "message": "This device has been banned.",
    "details": {
      "macAddress": "stable-device-or-installation-id",
      "reason": "Repeated policy violations",
      "expiresAt": "2026-07-28T12:00:00.000Z"
    }
  }
}
```

## Session status

Send the same stable identifier when polling session state:

`GET /api/users/session/status?macAddress=stable-device-or-installation-id`

Continue sending the mobile session token in `Authorization: Bearer <sessionToken>`. The response now includes:

```json
{
  "success": true,
  "data": {
    "deviceBanned": true,
    "deviceBanReason": "Repeated policy violations",
    "deviceBanExpiresAt": "2026-07-28T12:00:00.000Z",
    "macAddress": "stable-device-or-installation-id"
  }
}
```

Omitting `macAddress` returns HTTP `422` with error code `DEVICE_ID_REQUIRED`.

## Socket.IO events

- `device:banned` — compare `payload.data.macAddress` with the current device ID and immediately show the banned screen/logout only on the matching device.
- `device:unbanned` — compare the MAC/device ID and restore access on the matching device.

Both events include `success: true`. The ban event also includes `reason` and `banExpiresAt`; the unban event includes `reason`.

## Update profile

`PATCH /api/users/profile` requires `Authorization: Bearer <sessionToken>`.
Send any combination of `name`, `phone`, `email`, `profileImage`, `gender`, and
`dob`. Fields that are omitted remain unchanged. Country is assigned from signup
geolocation and cannot be edited by mobile clients. Nullable fields
can be cleared with `null`, except gender and DOB after their first assignment.

```json
{
  "name": "Aisha Khan",
  "gender": "female",
  "dob": "2001-07-24",
  "profileImage": "avatar:ranger"
}
```

The response returns the updated `data.user` object, including `gender` and the
date-only `dob`, plus the opaque `profileImage` value. Gender and DOB can each
only be set once; later PATCH attempts return `FIELD_LOCKED`. Phone numbers and
non-null email addresses remain unique across all users.
