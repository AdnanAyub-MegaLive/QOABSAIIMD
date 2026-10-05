# Mobile user registration API

## Endpoint

`POST /api/users/register`

Send the request with `Content-Type: application/json`. The endpoint is public and creates a regular listener account. VIP level, role, coin balance, and account status cannot be assigned by the mobile client.

## Request body

```json
{
  "name": "Aisha Khan",
  "phone": "+92 300 1234567",
  "password": "MyPass#8",
  "email": "aisha@example.com",
  "profileImage": "https://cdn.example.com/profiles/aisha.jpg",
  "gender": "female",
  "dob": "2001-07-24",
  "country": "Pakistan",
  "device": {
    "deviceId": "stable-device-identifier",
    "lastLoginIp": "192.0.2.10",
    "location": "Lahore, Pakistan",
    "platform": "Android",
    "deviceName": "Pixel 8"
  }
}
```

`name`, `phone`, and a password of at least 8 characters are required. Email is optional. Passwords are stored only as salted scrypt hashes and are never returned by the API. Phone numbers and email addresses must be unique across users. The complete `device` object is optional on the legacy endpoint; v1 requires `device.deviceId`, a stable Android installation identifier.

Send the country selected by the user as an English country name or ISO alpha-2
code. The portal validates and stores its canonical ISO-2 code (`Pakistan` and
`pk` both become `PK`). If omitted, a trusted connection-country header is used
as fallback. If both are unavailable, registration still succeeds with null.
An explicitly invalid country returns `422 VALIDATION_ERROR`; it is never
silently replaced by connection geography or compared with it.

`gender` and `dob` are nullable and returned in the registered user object.
Dates of birth use the date-only `YYYY-MM-DD` format. `profileImage`
may be a URL or an opaque bundled-avatar identifier such as `avatar:ranger`.

## React Native example

```js
const response = await fetch(`${API_BASE_URL}/api/users/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(registration),
});

const result = await response.json();
if (!response.ok) throw new Error(result.error?.message || "Registration failed");
return result.data.user;
```

Use the computer's LAN address during physical-device development, for example `http://192.168.88.13:3000`. Android emulators can normally reach the host at `http://10.0.2.2:3000`; `localhost` points to the mobile device or emulator itself.

## Responses

- `201`: user created; returns `data.user` plus `sessionToken`, `tokenType`
  (`Bearer`), `expiresAt`, and `sessionVersion`.
- `400`: malformed JSON.
- `409`: phone number or email already registered.
- `422`: validation failed; inspect `error.fields`.
- `500`: database or server failure.

Set `MOBILE_APP_ORIGIN` in `.env.local` when a browser-based client needs CORS restricted to a specific origin. Native React Native requests are not subject to browser CORS.

The token is opaque. Use the server-returned `expiresAt` when scheduling a
refresh; Android must not decode the token or assume the configured server TTL.
